import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SlackSettings } from './entities/slack-settings.entity';
import { encrypt, decrypt, isEncrypted } from './slack-crypto';

/**
 * The effective Slack configuration at send time — never the stored token,
 * which stays behind the encryption wall for its whole lifetime.
 */
export interface EffectiveSlackConfig {
  token: string;
  default_channel: string | null;
  enabled: boolean;
}

/** Safe-for-the-API projection. The token itself is never included. */
export interface SlackSettingsResponse {
  token_set: boolean;
  default_channel: string | null;
  enabled: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

/**
 * CRUD for the single Slack settings row.
 *
 * Mirrors SmtpSettingsService: one row (id = 1), a secret written encrypted and
 * never read back, and a masked projection for the API. Unlike mail there is no
 * environment override — a Slack credential is not something a deployment
 * typically injects via env the way SMTP hosts are, and adding that fork here
 * would be surface with no caller. `getEffective()` decrypts the token for the
 * send path only.
 */
@Injectable()
export class SlackSettingsService {
  private readonly logger = new Logger(SlackSettingsService.name);

  constructor(
    @InjectRepository(SlackSettings)
    private readonly repository: Repository<SlackSettings>,
  ) {}

  // ---- API projection ----

  private toResponse(settings: SlackSettings): SlackSettingsResponse {
    return {
      token_set:
        typeof settings.bot_token_encrypted === 'string' &&
        settings.bot_token_encrypted.length > 0,
      default_channel: settings.default_channel ?? null,
      enabled: settings.enabled,
      last_test_at: settings.last_test_at?.toISOString() ?? null,
      last_test_ok: settings.last_test_ok ?? null,
      last_test_error: settings.last_test_error ?? null,
    };
  }

  async getResponse(): Promise<SlackSettingsResponse> {
    const row = await this.getOrCreate();
    return this.toResponse(row);
  }

  /** For the send path (test button, and later the notification triggers). */
  async getEffective(): Promise<EffectiveSlackConfig> {
    const row = await this.getOrCreate();

    const token =
      row.bot_token_encrypted && isEncrypted(row.bot_token_encrypted)
        ? decrypt(row.bot_token_encrypted)
        : '';

    return {
      token,
      default_channel: row.default_channel ?? null,
      enabled: row.enabled,
    };
  }

  /** The one row, created on first read if absent so no explicit seeding is needed. */
  private async getOrCreate(): Promise<SlackSettings> {
    let row = await this.repository.findOne({ where: {} });
    if (!row) {
      row = this.repository.create({ id: 1 });
      await this.repository.save(row);
    }
    return row;
  }

  // ---- Update ----

  async update(fields: {
    token?: string;
    default_channel?: string;
    enabled?: boolean;
  }): Promise<SlackSettingsResponse> {
    const row = await this.getOrCreate();

    // Write-only: a value re-encrypts, an empty string clears the stored token.
    // Same rule as the SMTP password — the DTO deliberately does not trim it, so
    // an explicit "" still reaches here and clears.
    if (fields.token !== undefined) {
      row.bot_token_encrypted = fields.token ? encrypt(fields.token) : null;
    }
    if (fields.default_channel !== undefined) {
      row.default_channel = fields.default_channel || null;
    }
    if (fields.enabled !== undefined) row.enabled = fields.enabled;

    await this.repository.save(row);
    return this.toResponse(row);
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
   * Checks whether the current config can actually post.
   *
   * Returns an error message string, or null when it looks valid. Note this
   * validates that required fields are populated, not that the token works —
   * only a real Slack call can verify that, and that is what the test endpoint
   * does. This is the gate the notification triggers (#2/#3) consult before
   * calling `SlackService.sendMessage`, which does not itself check `enabled`.
   */
  async validate(): Promise<string | null> {
    const row = await this.getOrCreate();

    const hasToken =
      typeof row.bot_token_encrypted === 'string' &&
      row.bot_token_encrypted.length > 0;
    if (!hasToken) return 'A Slack bot token is required.';
    if (!row.default_channel) return 'A default channel is required.';
    if (!row.enabled) return 'Slack is disabled — enable it to post.';

    return null;
  }
}
