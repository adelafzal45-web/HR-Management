import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { EmailQueue } from './entities/email-queue.entity';
import { MailTransportService } from './mail-transport.service';
import { SmtpSettingsService } from './smtp-settings.service';
import { AuditService, type AuditActor } from '../audit/audit.service';
import {
  paginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination-query.dto';
import type { EmailQueueQueryDto } from './dto/email-queue-query.dto';

/**
 * Backoff schedule, indexed by attempt number.
 *
 * Growing intervals rather than a fixed delay: the overwhelming majority of SMTP
 * failures are either transient (a momentary DNS or network blip, cleared by the
 * first retry a minute later) or structural (wrong password, blocked port — no
 * number of fast retries will fix it). A fixed 1-minute retry serves the first
 * case and hammers the mail server pointlessly in the second, which is how a
 * sending IP gets rate-limited or blocklisted.
 *
 * Five entries against `max_attempts = 5`, spanning roughly seven hours — long
 * enough to survive a provider incident, short enough that a genuinely
 * deliverable message is not sitting in the queue overnight.
 */
const BACKOFF_MS = [
  60_000, // 1 minute
  5 * 60_000, // 5 minutes
  15 * 60_000, // 15 minutes
  60 * 60_000, // 1 hour
  6 * 60 * 60_000, // 6 hours
];

/** Rows claimed per tick. */
const BATCH_SIZE = 10;

/**
 * Drains the email outbox.
 *
 * Runs on a cron rather than a message broker because this deployment is a single
 * Node process against one Postgres — a queue table read every fifteen seconds is
 * the whole of the infrastructure, and adding Redis for transactional HR mail
 * volume would be a second thing to operate for no gain.
 *
 * `FOR UPDATE SKIP LOCKED` is still used to claim rows even though there is one
 * process today. It costs nothing, and it is what makes running two instances (or
 * one instance during a rolling deploy, when old and new overlap) safe rather than
 * a source of duplicate emails. Getting that wrong is not something you notice in
 * staging.
 */
@Injectable()
export class MailQueueProcessor {
  private readonly logger = new Logger(MailQueueProcessor.name);

  /**
   * Guards against overlapping ticks. `@Cron` fires on a timer regardless of
   * whether the previous invocation finished, so a batch that takes longer than
   * the interval — entirely possible with a 15-second connection timeout — would
   * otherwise run concurrently with itself.
   */
  private draining = false;

  constructor(
    @InjectRepository(EmailQueue)
    private readonly queue: Repository<EmailQueue>,
    private readonly transport: MailTransportService,
    private readonly smtpSettings: SmtpSettingsService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Whether the processor is allowed to send.
   *
   * Off by default under `NODE_ENV=test` so a test suite that creates employees
   * does not mail real addresses. Explicit `MAIL_QUEUE_ENABLED=false` disables it
   * anywhere, which is the supported way to run a second instance that serves
   * HTTP without competing for the queue.
   */
  private get enabled(): boolean {
    const flag = process.env.MAIL_QUEUE_ENABLED;
    if (flag !== undefined) {
      return flag !== 'false' && flag !== '0';
    }
    return process.env.NODE_ENV !== 'test';
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async drain(): Promise<void> {
    if (!this.enabled || this.draining) {
      return;
    }

    this.draining = true;
    try {
      // Configuration is checked once per tick, not per row. While SMTP is
      // unconfigured or disabled, rows accumulate as `pending` rather than
      // burning their five attempts against a server that was never reachable —
      // so enabling SMTP later delivers the backlog instead of finding it failed.
      if (await this.smtpSettings.validate()) {
        return;
      }

      const claimed = await this.claimBatch();

      for (const row of claimed) {
        await this.attempt(row);
      }
    } catch (error) {
      // The cron must survive anything. An unhandled rejection here would kill
      // the schedule for the process lifetime, silently stopping all mail.
      this.logger.error(
        `Queue drain failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.draining = false;
    }
  }

  /**
   * Atomically moves up to BATCH_SIZE due rows to `sending` and returns them.
   *
   * The claim and the status change are one transaction, so a row cannot be
   * observed as `pending` by a second worker after this one has taken it. Rows
   * left in `sending` by a process that crashed mid-send are recovered by
   * `requeueStalled`.
   */
  private async claimBatch(): Promise<EmailQueue[]> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Array<{ email_queue_id: string }> = await manager.query(
        `SELECT "email_queue_id"
           FROM "email_queue"
          WHERE "status" = 'pending'
            AND "next_attempt_at" <= now()
          ORDER BY "next_attempt_at" ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE],
      );

      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((row) => row.email_queue_id);

      await manager.query(
        `UPDATE "email_queue"
            SET "status" = 'sending',
                "attempts" = "attempts" + 1,
                "updated_at" = now()
          WHERE "email_queue_id" = ANY($1::uuid[])`,
        [ids],
      );

      return manager
        .getRepository(EmailQueue)
        .find({ where: { email_queue_id: In(ids) } });
    });
  }

  /** Sends one claimed row and records the outcome. */
  private async attempt(row: EmailQueue): Promise<void> {
    // `claimBatch` already incremented `attempts` and re-read the row, so this
    // column IS the attempt now in progress — 1 on the first try. Adding one
    // here would skip the first backoff step and retire rows a try early.
    const attemptNumber = row.attempts;

    try {
      const { messageId } = await this.transport.send({
        to: row.to_email,
        toName: row.to_name,
        subject: row.subject,
        html: row.body_html,
      });

      await this.queue.update(row.email_queue_id, {
        status: 'sent',
        sent_at: new Date(),
        last_error: null,
      });

      this.logger.log(
        `Sent ${row.template_key ?? 'email'} to ${row.to_email} (${messageId}).`,
      );

      await this.audit.record({
        actor: SYSTEM_ACTOR,
        action: 'email.sent',
        entityType: 'email_queue',
        entityId: row.email_queue_id,
        after: {
          to: row.to_email,
          template_key: row.template_key,
          attempts: attemptNumber,
          message_id: messageId,
        },
      });
    } catch (error) {
      await this.recordFailure(row, attemptNumber, error);
    }
  }

  /**
   * Applies the backoff, or gives up at `max_attempts`.
   *
   * Only the terminal failure writes an audit row. A transient failure that the
   * next retry fixes is operational noise, and putting it in the audit trail
   * would bury the deliveries that actually never happened.
   */
  private async recordFailure(
    row: EmailQueue,
    attemptNumber: number,
    error: unknown,
  ): Promise<void> {
    const detail = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, 2000);

    const exhausted = attemptNumber >= row.max_attempts;

    if (exhausted) {
      await this.queue.update(row.email_queue_id, {
        status: 'failed',
        last_error: detail,
      });

      this.logger.error(
        `Giving up on ${row.template_key ?? 'email'} to ${row.to_email} after ${attemptNumber} attempts: ${detail}`,
      );

      await this.audit.record({
        actor: SYSTEM_ACTOR,
        action: 'email.failed',
        entityType: 'email_queue',
        entityId: row.email_queue_id,
        after: {
          to: row.to_email,
          template_key: row.template_key,
          attempts: attemptNumber,
          error: detail,
        },
      });
      return;
    }

    const delay =
      BACKOFF_MS[Math.min(attemptNumber - 1, BACKOFF_MS.length - 1)];

    await this.queue.update(row.email_queue_id, {
      status: 'pending',
      last_error: detail,
      next_attempt_at: new Date(Date.now() + delay),
    });

    this.logger.warn(
      `Attempt ${attemptNumber}/${row.max_attempts} failed for ${row.to_email}; retrying in ${Math.round(delay / 1000)}s. ${detail}`,
    );
  }

  /**
   * Returns rows stuck in `sending` to `pending`.
   *
   * A process killed between claiming a row and recording its outcome leaves it
   * `sending` forever, invisible to the drain query. Ten minutes is comfortably
   * longer than the transport's own timeouts (max ~20s), so a row this old is not
   * "slow", it is orphaned.
   *
   * The risk is a duplicate: if the crash happened after the SMTP server accepted
   * the message but before the update committed, this resends it. That is the
   * right trade for transactional mail — a second copy of a password-reset email
   * is a minor annoyance, never receiving it locks the user out.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async requeueStalled(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const result = await this.queue
        .createQueryBuilder()
        .update(EmailQueue)
        .set({ status: 'pending', next_attempt_at: () => 'now()' })
        .where('status = :status', { status: 'sending' })
        .andWhere("updated_at < now() - interval '10 minutes'")
        .execute();

      if (result.affected) {
        this.logger.warn(
          `Requeued ${result.affected} email(s) left in 'sending' by an interrupted process.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to requeue stalled emails: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ---- Admin surface ----

  /** Paginated delivery log, newest first. */
  async findAll(
    query: EmailQueueQueryDto,
  ): Promise<PaginatedResult<EmailQueue>> {
    const qb = this.queue.createQueryBuilder('email');

    if (query.status) {
      qb.andWhere('email.status = :status', { status: query.status });
    }
    if (query.template_key) {
      qb.andWhere('email.template_key = :templateKey', {
        templateKey: query.template_key,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(email.to_email ILIKE :search OR email.subject ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('email.created_at', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginatedResult(data, total, query);
  }

  async findOne(id: string): Promise<EmailQueue> {
    const row = await this.queue.findOne({ where: { email_queue_id: id } });

    if (!row) {
      throw new NotFoundException(`Queued email ${id} not found`);
    }

    return row;
  }

  /**
   * Resets a failed row for another attempt.
   *
   * `attempts` goes back to zero so the retry gets the full backoff schedule
   * again — an admin retrying after fixing the SMTP password wants five fresh
   * attempts, not the one remaining from before.
   */
  async retry(id: string, actor?: AuditActor): Promise<EmailQueue> {
    const row = await this.findOne(id);

    // Only `failed` and `cancelled` can be retried. Re-queueing a `sent` row
    // would deliver a second copy of a message the recipient already has, and
    // re-queueing a `sending` one would race the drain that currently holds it —
    // the same row would then be in flight twice. `pending` is already scheduled,
    // so retrying it would only reset a backoff the operator did not ask to reset.
    if (row.status !== 'failed' && row.status !== 'cancelled') {
      throw new ConflictException(
        `Queued email ${id} is ${row.status} and cannot be retried`,
      );
    }

    await this.queue.update(id, {
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date(),
      last_error: null,
    });

    await this.audit.record({
      actor: actor ?? {},
      action: 'email.queue.retry',
      entityType: 'email_queue',
      entityId: id,
      before: { status: row.status, attempts: row.attempts },
      after: { status: 'pending', attempts: 0 },
    });

    return this.findOne(id);
  }

  /**
   * Stops a message from being sent.
   *
   * Only `pending` and `failed` rows can be cancelled. A `sending` row is already
   * at the SMTP server, so marking it cancelled would be a false record of
   * something that may well have been delivered.
   */
  async cancel(id: string, actor?: AuditActor): Promise<EmailQueue> {
    const row = await this.findOne(id);

    // Only `pending` and `failed` are cancellable. `sending` is already with the
    // mail server and `sent` has left, so neither can be recalled; `cancelled` is
    // already in the target state, and letting it through would append an audit
    // row describing a cancelled -> cancelled transition that never happened.
    if (row.status !== 'pending' && row.status !== 'failed') {
      throw new ConflictException(
        `Queued email ${id} is already ${row.status} and cannot be cancelled`,
      );
    }

    await this.queue.update(id, { status: 'cancelled' });

    await this.audit.record({
      actor: actor ?? {},
      action: 'email.queue.cancel',
      entityType: 'email_queue',
      entityId: id,
      before: { status: row.status },
      after: { status: 'cancelled' },
    });

    return this.findOne(id);
  }

  /** Counts per status, for the settings screen summary. */
  async stats(): Promise<Record<string, number>> {
    const rows: Array<{ status: string; count: string }> = await this.queue
      .createQueryBuilder('email')
      .select('email.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('email.status')
      .getRawMany();

    const stats: Record<string, number> = {
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      stats[row.status] = Number(row.count);
    }

    return stats;
  }
}

/**
 * Actor for queue events, which have no HTTP request behind them.
 *
 * A null `user_id` with an explicit email marks the row as machine-originated,
 * which is more honest than attributing a cron send to whichever admin happened
 * to trigger the enqueue minutes earlier.
 */
const SYSTEM_ACTOR: AuditActor = {
  user_id: null,
  email: 'system@mail-queue',
};
