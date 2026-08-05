import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { PasswordResetToken } from './password-reset-token.entity';
import { PasswordPolicyService } from './password-policy.service';
import { RefreshTokenService } from './refresh-token.service';
import { User } from '../users/user.entity';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { APP_BASE_URL } from '../mail/template-renderer.service';

/**
 * How long a reset link stays valid.
 *
 * One hour is the usual balance: long enough to survive a slow mail relay and a
 * user who reads mail on their phone an hour later, short enough that a link
 * sitting in an abandoned inbox or a mail-archive backup is not a standing key
 * to the account.
 */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Exposed to the UI and the email copy so the two never disagree. */
export const RESET_TOKEN_TTL_MINUTES = RESET_TOKEN_TTL_MS / 60_000;

/** Matches BCRYPT_ROUNDS in auth.service.ts — one cost factor for the app. */
const BCRYPT_ROUNDS = 12;

/** Outcome of issuing a link, for the admin/bulk caller. Never sent to the requester. */
export type IssueOutcome =
  | { status: 'sent'; email: string; expiresAt: Date }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Issues and redeems password-reset tokens.
 *
 * Modelled on {@link RefreshTokenService}: the raw token exists only in the
 * email, the database holds a SHA-256 digest, and validity is decided by the
 * stored row rather than by anything the client presents. A database leak
 * therefore yields no usable reset links.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  /**
   * SHA-256 of the raw token — same reasoning as the refresh token: 256 bits of
   * server-generated entropy is not brute-forcible, so a slow KDF would buy
   * nothing and cost latency on every validate call.
   */
  private hash(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * 32 bytes from the CSPRNG, base64url so it survives a URL untouched.
   *
   * `randomBytes`, never `Math.random`: the latter is seeded predictably and a
   * guessable reset token is a total account takeover.
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Self-service request. **Always resolves**, whether or not the address exists.
   *
   * This is the account-enumeration defence and it is the whole reason the method
   * returns void rather than a result: a 404 for an unknown address, or even a
   * measurably faster response, turns this endpoint into a tool for discovering
   * who works here. The caller gets the same generic acknowledgement either way,
   * and the real signal goes to the audit log instead.
   */
  async request(email: string, ip?: string | null): Promise<void> {
    const normalized = email.trim().toLowerCase();

    const user = await this.userRepository.findOne({
      where: { email: normalized },
      relations: { department: true, designation: true },
    });

    if (!user) {
      // Logged, not returned. An operator investigating "I never got the email"
      // needs to see this; the requester must not.
      this.logger.log(
        `Password reset requested for an unknown address (${normalized}).`,
      );
      return;
    }

    if (!user.password_reset_allowed) {
      this.logger.warn(
        `Password reset requested for ${normalized}, but resets are disabled on that account.`,
      );
      await this.auditService.record({
        actor: {
          user_id: user.user_id,
          email: normalized,
          ip: ip ?? undefined,
        },
        action: 'employee.password.reset_link.blocked',
        entityType: 'User',
        entityId: user.user_id,
        after: { reason: 'password_reset_allowed is false' },
      });
      return;
    }

    const outcome = await this.issueFor(user, {
      actor: { user_id: user.user_id, email: normalized, ip: ip ?? undefined },
      requestedByAdmin: null,
      ip,
    });

    if (outcome.status !== 'sent') {
      this.logger.warn(
        `Reset link for ${normalized} was not sent: ${outcome.reason}`,
      );
    }
  }

  /**
   * Issues a link for one user and queues the email.
   *
   * Shared by the self-service and admin-bulk paths so both produce identical
   * tokens, identical mail, and identical audit rows. Returns an outcome rather
   * than throwing: the bulk caller needs per-user results, and a single failure
   * there must not abandon the rest of the batch.
   */
  async issueFor(
    user: User,
    options: {
      actor: AuditActor;
      /** The admin issuing the link, or null for a self-service request. */
      requestedByAdmin?: string | null;
      ip?: string | null;
    },
  ): Promise<IssueOutcome> {
    if (!user.email) {
      return { status: 'skipped', reason: 'The account has no email address' };
    }

    if (!user.password_reset_allowed) {
      return {
        status: 'skipped',
        reason: 'Password resets are disabled for this account',
      };
    }

    const rawToken = this.generateToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    try {
      await this.dataSource.transaction(async (manager) => {
        const tokens = manager.getRepository(PasswordResetToken);

        // Any earlier live link is superseded, so only the newest one works.
        // Otherwise a user who clicks "resend" three times holds three valid
        // keys, and revoking the one that leaked would not be enough.
        await tokens.update(
          {
            user_id: user.user_id,
            used_at: IsNull(),
            invalidated_at: IsNull(),
          },
          { invalidated_at: new Date() },
        );

        await tokens.save(
          tokens.create({
            user_id: user.user_id,
            token_hash: this.hash(rawToken),
            delivery_email: user.email,
            expires_at: expiresAt,
            created_by_user_id: options.requestedByAdmin ?? null,
            created_ip: options.ip ?? null,
          }),
        );
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist a reset token for ${user.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'failed', reason: 'Could not create the reset token' };
    }

    // Queued after the token is committed. Enqueuing first could email a link
    // whose row was rolled back — a link the user would find dead.
    const enqueued = await this.mailService.enqueue({
      templateKey: options.requestedByAdmin
        ? 'admin_reset_notification'
        : 'password_reset',
      to: user.email,
      toName: this.displayName(user),
      relatedUserId: user.user_id,
      context: {
        employee_name: this.displayName(user),
        employee_id: user.employee_code ?? '',
        department: user.department?.department_name ?? '',
        designation: user.designation?.title ?? '',
        reset_link: this.linkFor(rawToken),
        expiry_minutes: String(RESET_TOKEN_TTL_MINUTES),
      },
    });

    await this.auditService.record({
      actor: options.actor,
      action: 'employee.password.reset_link.sent',
      entityType: 'User',
      entityId: user.user_id,
      after: {
        delivery_email: user.email,
        expires_at: expiresAt.toISOString(),
        issued_by_admin: Boolean(options.requestedByAdmin),
        // The token itself is never recorded. An audit trail readable by admins
        // must not double as a list of live account-takeover credentials.
        queued: enqueued.queued,
      },
    });

    if (!enqueued.queued) {
      return {
        status: 'failed',
        reason: `The reset email could not be queued (${enqueued.reason})`,
      };
    }

    return { status: 'sent', email: user.email, expiresAt };
  }

  /**
   * Reports whether a token is currently redeemable, without consuming it.
   *
   * Lets the UI show "this link has expired" before rendering a password form,
   * rather than after the user has typed a new password twice. Returns a flag
   * instead of throwing because "not valid" is the expected answer here, not an
   * error condition.
   */
  async validate(
    rawToken: string,
  ): Promise<{ valid: boolean; reason?: string; email?: string }> {
    const record = await this.tokenRepository.findOne({
      where: { token_hash: this.hash(rawToken) },
    });

    if (!record) {
      return { valid: false, reason: 'This reset link is not recognised.' };
    }

    if (record.used_at) {
      return { valid: false, reason: 'This reset link has already been used.' };
    }

    if (record.invalidated_at) {
      return {
        valid: false,
        reason: 'This reset link was replaced by a newer one.',
      };
    }

    if (record.expires_at.getTime() <= Date.now()) {
      return { valid: false, reason: 'This reset link has expired.' };
    }

    // The masked address confirms to the user which mailbox the link belongs to
    // without disclosing the full address to whoever holds the URL.
    return { valid: true, email: this.maskEmail(record.delivery_email) };
  }

  /**
   * Consumes a token and sets the new password.
   *
   * Everything happens in one transaction: marking the token used, writing the
   * old hash to history, and storing the new one. If any step fails, a token
   * must not be left spent with the password unchanged — that would lock the
   * user out with no way back except another email.
   */
  async redeem(
    rawToken: string,
    newPassword: string,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const tokenHash = this.hash(rawToken);

    const record = await this.tokenRepository.findOne({
      where: { token_hash: tokenHash },
      relations: { user: true },
    });

    // One generic message for unknown, used, superseded, and expired. A caller
    // probing tokens learns only "no", never how close they got.
    if (
      !record ||
      record.used_at ||
      record.invalidated_at ||
      record.expires_at.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Please request a new one.',
      );
    }

    const user = record.user;

    if (!user.password_reset_allowed) {
      throw new BadRequestException(
        'Password resets are disabled for this account.',
      );
    }

    // Checked before the token is spent, so a rejected password leaves the link
    // usable for another attempt.
    await this.passwordPolicy.assertAcceptable(
      user.user_id,
      newPassword,
      user.password,
    );

    const previousHash = user.password;
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(PasswordResetToken)
        .update(
          { password_reset_token_id: record.password_reset_token_id },
          { used_at: new Date() },
        );

      // Every other outstanding link dies with this redemption.
      await manager.getRepository(PasswordResetToken).update(
        {
          user_id: user.user_id,
          used_at: IsNull(),
          invalidated_at: IsNull(),
        },
        { invalidated_at: new Date() },
      );

      await manager
        .getRepository(User)
        .update({ user_id: user.user_id }, { password: newHash });

      await this.passwordPolicy.remember(user.user_id, previousHash, manager);
    });

    // A reset must invalidate live sessions. Without this, someone who stole a
    // refresh cookie keeps access for its full 7-day life — and the reset the
    // victim just performed to evict them would have accomplished nothing.
    await this.refreshTokenService.revokeAllForUser(user.user_id);

    await this.auditService.record({
      actor: { user_id: user.user_id, email: user.email, ip: ip ?? undefined },
      action: 'employee.password.reset_link.redeemed',
      entityType: 'User',
      entityId: user.user_id,
      after: { password_changed: true, sessions_revoked: true },
    });

    // Confirmation mail is best-effort: MailService swallows its own failures,
    // and a password that was successfully changed must not report an error
    // because the notification did not go out.
    await this.mailService.enqueue({
      templateKey: 'password_changed',
      to: user.email,
      toName: this.displayName(user),
      relatedUserId: user.user_id,
      context: {
        employee_name: this.displayName(user),
        employee_id: user.employee_code ?? '',
      },
    });

    return {
      message:
        'Your password has been reset. Please sign in with your new password.',
    };
  }

  /** Issue history for one user, for the admin status/resend view. Never includes hashes. */
  async historyFor(userId: string): Promise<
    Array<{
      password_reset_token_id: string;
      delivery_email: string;
      created_at: Date;
      expires_at: Date;
      used_at?: Date | null;
      invalidated_at?: Date | null;
      created_by_user_id?: string | null;
      status: 'used' | 'expired' | 'superseded' | 'pending';
    }>
  > {
    const rows = await this.tokenRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 20,
    });

    return rows.map((row) => ({
      password_reset_token_id: row.password_reset_token_id,
      delivery_email: row.delivery_email,
      created_at: row.created_at,
      expires_at: row.expires_at,
      used_at: row.used_at ?? null,
      invalidated_at: row.invalidated_at ?? null,
      created_by_user_id: row.created_by_user_id ?? null,
      status: row.used_at
        ? 'used'
        : row.invalidated_at
          ? 'superseded'
          : row.expires_at.getTime() <= Date.now()
            ? 'expired'
            : 'pending',
    }));
  }

  /**
   * Invalidates every live link for a user.
   *
   * Called when a password changes by another route: a reset link minted before
   * that change is a live key to the account, and leaving it usable would let an
   * attacker who requested one earlier undo the victim's password change.
   */
  async invalidateAllForUser(userId: string): Promise<void> {
    await this.tokenRepository.update(
      { user_id: userId, used_at: IsNull(), invalidated_at: IsNull() },
      { invalidated_at: new Date() },
    );
  }

  private linkFor(rawToken: string): string {
    // encodeURIComponent even though base64url is URL-safe: the encoding is an
    // implementation detail of generateToken, and a future change to it must not
    // silently start producing malformed links.
    return `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  private displayName(user: User): string {
    const name = [user.first_name, user.last_name]
      .filter((part) => part && part.trim().length > 0)
      .join(' ')
      .trim();

    return name.length > 0 ? name : (user.email ?? 'there');
  }

  /** `jane.doe@example.com` -> `j*******e@example.com`. */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain || local.length <= 2) {
      return `***@${domain ?? ''}`;
    }

    return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}@${domain}`;
  }
}
