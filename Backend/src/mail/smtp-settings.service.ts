import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SmtpSettings, type SmtpEncryption } from './entities/smtp-settings.entity';
import { encrypt, decrypt, isEncrypted } from './smtp-crypto';

/**
 * The effective SMTP configuration at send time — never the stored password,
 * which stays behind the encryption wall for its whole lifetime.
 */
export interface EffectiveSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  enabled: boolean;
}

/** Safe-for-the-API projection. The password field is never included. */
export interface SmtpSettingsResponse {
  host: string | null;
  port: number;
  username: string | null;
  password_set: boolean;
  encryption: SmtpEncryption;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  enabled: boolean;
  env_override: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

/**
 * CRUD for the single SMTP settings row, plus the env-override resolution that
 * decides what configuration a send uses.
 *
 * Env override is all-or-nothing: if `SMTP_HOST` is set, the entire
 * configuration comes from the environment and the DB row is ignored. A
 * half-and-half merge of env host + DB port would make it impossible to know
 * which source each field came from when delivery breaks, and negates the
 * single-source-of-truth value of having a settings row at all.
 *
 * The test-send path is synchronous (it creates a nodemailer transport and calls
 * `verify()` / `sendMail()` right away) so the admin who clicked "Test" sees the
 * real error in the response. Normal sends queue through EmailQueue, but a
 * queued test that later failed silently is worse than useless — it would
 * literally encourage deploying a broken configuration.
 */
@Injectable()
export class SmtpSettingsService {
  private readonly logger = new Logger(SmtpSettingsService.name);

  constructor(
    @InjectRepository(SmtpSettings)
    private readonly repository: Repository<SmtpSettings>,
  ) {}

  // ---- Env override ----

  /** The env override is active when SMTP_HOST is set. Everything else is optional. */
  private isEnvOverride(): boolean {
    return !!process.env.SMTP_HOST;
  }

  private envConfig(): EffectiveSmtpConfig {
    return {
      host: process.env.SMTP_HOST ?? '',
      port: Number(process.env.SMTP_PORT) || 587,
      username: process.env.SMTP_USERNAME ?? '',
      password: process.env.SMTP_PASSWORD ?? '',
      encryption: ((process.env.SMTP_ENCRYPTION ?? 'tls') as SmtpEncryption),
      fromName: process.env.SMTP_FROM_NAME ?? process.env.SMTP_USERNAME ?? '',
      fromEmail: process.env.SMTP_FROM_EMAIL ?? '',
      replyTo: process.env.SMTP_REPLY_TO,
      enabled: true,
    };
  }

  // ---- API projection ----

  private toResponse(settings: SmtpSettings, envOverride: boolean): SmtpSettingsResponse {
    return {
      host: settings.host ?? null,
      port: settings.port,
      username: settings.username ?? null,
      password_set:
        typeof settings.password_encrypted === 'string' &&
        settings.password_encrypted.length > 0,
      encryption: settings.encryption,
      from_name: settings.from_name ?? null,
      from_email: settings.from_email ?? null,
      reply_to: settings.reply_to ?? null,
      enabled: settings.enabled,
      env_override: envOverride,
      last_test_at: settings.last_test_at?.toISOString() ?? null,
      last_test_ok: settings.last_test_ok ?? null,
      last_test_error: settings.last_test_error ?? null,
    };
  }

  async getResponse(): Promise<SmtpSettingsResponse> {
    const row = await this.getOrCreate();
    return this.toResponse(row, this.isEnvOverride());
  }

  /** For services that need the actual config to send. */
  async getEffective(): Promise<EffectiveSmtpConfig> {
    if (this.isEnvOverride()) {
      return this.envConfig();
    }

    const row = await this.getOrCreate();

    const password =
      row.password_encrypted && isEncrypted(row.password_encrypted)
        ? decrypt(row.password_encrypted)
        : '';

    return {
      host: row.host ?? '',
      port: row.port,
      username: row.username ?? '',
      password,
      encryption: row.encryption,
      fromName: row.from_name ?? '',
      fromEmail: row.from_email ?? '',
      replyTo: row.reply_to ?? undefined,
      enabled: row.enabled,
    };
  }

  /** The one row, created on first read if absent so no explicit seeding is needed. */
  private async getOrCreate(): Promise<SmtpSettings> {
    let row = await this.repository.findOne({ where: {} });
    if (!row) {
      row = this.repository.create({ id: 1 });
      await this.repository.save(row);
    }
    return row;
  }

  // ---- Update ----

  async update(
    fields: {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      encryption?: SmtpEncryption;
      from_name?: string;
      from_email?: string;
      reply_to?: string;
      enabled?: boolean;
    },
  ): Promise<SmtpSettingsResponse> {
    // A bare Error would surface as a 500 through AllExceptionsFilter; the
    // settings screen needs a 4xx it can show as a message, because this is a
    // deployment-configuration state and not a fault.
    if (this.isEnvOverride()) {
      throw new ConflictException(
        'SMTP settings are managed by environment variables (SMTP_HOST is set) and cannot be edited here.',
      );
    }

    const row = await this.getOrCreate();

    if (fields.host !== undefined) row.host = fields.host || null;
    if (fields.port !== undefined) row.port = fields.port;
    if (fields.username !== undefined) row.username = fields.username || null;
    if (fields.password !== undefined) {
      row.password_encrypted = fields.password ? encrypt(fields.password) : null;
    }
    if (fields.encryption !== undefined) row.encryption = fields.encryption;
    if (fields.from_name !== undefined) row.from_name = fields.from_name || null;
    if (fields.from_email !== undefined) row.from_email = fields.from_email || null;
    if (fields.reply_to !== undefined) row.reply_to = fields.reply_to || null;
    if (fields.enabled !== undefined) row.enabled = fields.enabled;

    await this.repository.save(row);
    return this.toResponse(row, false);
  }

  /** Records the result of a test-send attempt for the settings screen. */
  async recordTestResult(ok: boolean, error?: string): Promise<void> {
    const row = await this.getOrCreate();
    row.last_test_at = new Date();
    row.last_test_ok = ok;
    row.last_test_error = error ?? null;
    await this.repository.save(row);
  }

  // ---- Validation ----

  /**
   * Checks whether the current config can actually connect.
   *
   * Returns an error message string, or null when it looks valid. Note this
   * validates that required fields are populated, not that the credentials are
   * correct — only a real SMTP handshake can verify that, and that is what the
   * test-email endpoint does.
   */
  async validate(): Promise<string | null> {
    if (this.isEnvOverride()) {
      const env = this.envConfig();
      if (!env.host) return 'SMTP_HOST is set but is empty.';
      if (!env.fromEmail) return 'SMTP_FROM_EMAIL is required.';
      return null;
    }

    const row = await this.getOrCreate();
    if (!row.host) return 'SMTP host is required.';
    if (!row.from_email) return 'From email is required.';
    if (!row.enabled) return 'SMTP is disabled — enable it to send.';

    const hasPassword =
      typeof row.password_encrypted === 'string' && row.password_encrypted.length > 0;
    if (row.username && !hasPassword) {
      return 'Password is required when a username is set.';
    }

    return null;
  }
}
