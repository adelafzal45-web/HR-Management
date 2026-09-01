import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import {
  Notification,
  NotificationCategory,
} from '../notifications/notifications.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SlackService } from '../slack/slack.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import {
  CelebrationConfig,
  CELEBRATION_CONFIG_DEFAULTS,
} from '../company-settings/celebration-config.type';

import { CelebrationsService } from './celebrations.service';
import {
  Anniversary,
  AnnouncementResult,
  Celebrant,
  CELEBRATION_REFERENCE_TYPE,
} from './celebrations.types';

/**
 * Daily birthday & work-anniversary announcer (backlog #2, made configurable in
 * #2b).
 *
 * Mirrors the conventions in `appraisal-scheduler.service.ts`: a re-entrancy
 * flag, a `CELEBRATION_JOBS_ENABLED` kill-switch that also stays off under
 * `NODE_ENV === 'test'`, a single try/catch/finally around the body, and — for
 * a *configurable* send time — a poll cron rather than a fixed `@Cron` hour.
 *
 * Every 15 minutes `tick()` reads `company_settings.celebration_config` (null →
 * CELEBRATION_CONFIG_DEFAULTS, i.e. the original enabled/08:00/heading defaults)
 * and fires once the configured send time has passed for the day. Polling makes
 * the send time editable without re-registering a cron, and it self-heals: if the
 * app was down at the exact minute, the next tick that day still catches up. On a
 * run it in order:
 *   1. reads today's celebrants (shared with the dashboard widget),
 *   2. bails if a prior run today already left celebration rows (idempotency),
 *   3. writes one consolidated broadcast to everyone's bell,
 *   4. posts the same summary to the Slack default channel *if* Slack is enabled.
 *
 * The bell rows are written before the Slack post and double as the
 * idempotency marker; if Slack fails afterwards it is simply not retried until
 * tomorrow — acceptable for a low-stakes daily announcement, and matching the
 * appraisal jobs' "the notification row is the record" tradeoff.
 *
 * `runNow()` backs the "Send today's celebrations now" button: it forces an
 * immediate run, bypassing the time window, the once-per-day guard and the env
 * kill-switch (so HR can always fire and re-send), but still respecting the
 * re-entrancy flag.
 */
@Injectable()
export class CelebrationSchedulerService {
  private readonly logger = new Logger(CelebrationSchedulerService.name);
  private running = false;

  /**
   * Local date ('YYYY-MM-DD') of the last announcement, an in-memory fast-path
   * so the 15-minute poll can skip the rest of the day without hitting the
   * notifications table on every tick. `hasAnnouncedToday()` remains the
   * authoritative, restart-surviving guard; this only short-circuits ahead of
   * it and is intentionally not persisted.
   */
  private lastAnnouncedDate: string | null = null;

  constructor(
    private readonly celebrations: CelebrationsService,
    private readonly notifications: NotificationsService,
    private readonly slack: SlackService,
    private readonly companySettings: CompanySettingsService,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  private get enabled(): boolean {
    const flag = process.env.CELEBRATION_JOBS_ENABLED;
    if (flag !== undefined) {
      return flag !== 'false' && flag !== '0';
    }
    return process.env.NODE_ENV !== 'test';
  }

  /**
   * Poll every 15 minutes and fire once the configured send time has passed for
   * the day. The env kill-switch, the in-memory date fast-path and the
   * persistent `hasAnnouncedToday()` guard between them keep it to one
   * announcement per day. The `running` flag is held for the whole tick
   * (including the config read) so a slow run cannot overlap the next tick.
   */
  @Cron('0 */15 * * * *')
  async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const config = await this.loadConfig();
      if (!config.enabled) return;

      const now = new Date();
      const today = this.dateKey(now);
      if (this.lastAnnouncedDate === today) return;

      const sendAt = this.timeToMinutes(config.send_time);
      if (sendAt === null) return;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes < sendAt) return;

      await this.runAnnouncement(config, { force: false });
    } catch (error) {
      this.logger.error(
        `celebration tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Fire the announcement immediately, on demand from the Celebrations settings
   * screen. Ignores the send-time window and the once-per-day guard (so HR can
   * re-send) and is not gated by the env kill-switch, but still respects the
   * re-entrancy flag so a click cannot overlap a run already in flight. Errors
   * propagate so the caller can surface them; the scheduled tick, by contrast,
   * swallows them to stay alive.
   */
  async runNow(): Promise<AnnouncementResult> {
    if (this.running) {
      return {
        announced: false,
        reason: 'busy',
        birthdays: 0,
        anniversaries: 0,
        informed: 0,
        slack: {
          sent: false,
          reason: 'An announcement is already in progress.',
        },
      };
    }
    this.running = true;
    try {
      const config = await this.loadConfig();
      return await this.runAnnouncement(config, { force: true });
    } finally {
      this.running = false;
    }
  }

  /**
   * The announcement itself: read today's celebrants, write the group bell
   * broadcast, and post the Slack summary. `config.heading` is its title / first
   * line; the 🎂/🎊 celebrant list under the heading is composed here.
   *
   * `force` skips the persistent once-per-day guard (used by "Send now"); the
   * scheduled tick passes `false` so a restart after the send time doesn't
   * double-post. Assumes the caller holds the re-entrancy flag.
   */
  private async runAnnouncement(
    config: CelebrationConfig,
    { force }: { force: boolean },
  ): Promise<AnnouncementResult> {
    const { birthdays, anniversaries } =
      await this.celebrations.getTodaysCelebrations();

    if (birthdays.length === 0 && anniversaries.length === 0) {
      return {
        announced: false,
        reason: 'no-celebrations',
        birthdays: 0,
        anniversaries: 0,
        informed: 0,
        slack: { sent: false, reason: 'No celebrations today.' },
      };
    }

    // Idempotency: the bell rows carry reference_type = 'Celebration', so if any
    // already exist for today a prior run (or a restart) handled it — skip both
    // the fan-out and the Slack post. "Send now" (force) deliberately bypasses
    // this so HR can re-send.
    if (!force && (await this.hasAnnouncedToday())) {
      this.logger.debug('Celebrations already announced today; skipping.');
      this.lastAnnouncedDate = this.dateKey(new Date());
      return {
        announced: false,
        reason: 'already-announced',
        birthdays: birthdays.length,
        anniversaries: anniversaries.length,
        informed: 0,
        slack: { sent: false, reason: 'Already announced today.' },
      };
    }

    const summary = this.buildSummary(config.heading, birthdays, anniversaries);

    // --- In-app: everyone hears about today's celebrations ---
    const recipientIds = await this.celebrations.getActiveUserIds();
    const informed = await this.notifications.pushMany(recipientIds, {
      title: config.heading,
      message: summary,
      category: NotificationCategory.ANNOUNCEMENT,
      link: '/dashboard',
      referenceType: CELEBRATION_REFERENCE_TYPE,
    });

    this.logger.log(
      `Announced ${birthdays.length} birthday(s) and ${anniversaries.length} anniversary(ies) to ${informed} recipient(s).`,
    );

    // --- Slack: one post to the default channel, only if enabled ---
    const slackResult = await this.slack.postIfEnabled({ text: summary });
    if (!slackResult.sent) {
      this.logger.log(`Slack celebration post skipped: ${slackResult.reason}`);
    }

    this.lastAnnouncedDate = this.dateKey(new Date());

    return {
      announced: true,
      birthdays: birthdays.length,
      anniversaries: anniversaries.length,
      informed,
      slack: { sent: slackResult.sent, reason: slackResult.reason },
    };
  }

  /** Current config, or the defaults (which reproduce the original behaviour). */
  private async loadConfig(): Promise<CelebrationConfig> {
    const settings = await this.companySettings.get();
    return settings.celebration_config ?? CELEBRATION_CONFIG_DEFAULTS;
  }

  private async hasAnnouncedToday(): Promise<boolean> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    const count = await this.notificationRepository.count({
      where: {
        reference_type: CELEBRATION_REFERENCE_TYPE,
        created_at: Between(start, end),
      },
    });
    return count > 0;
  }

  /**
   * Shared body for the bell broadcast and the Slack post. The `heading` (first
   * line) is admin-configurable; the 🎂/🎊 celebrant list under it is composed
   * here and still pluralizes "1 year"/"N years".
   */
  private buildSummary(
    heading: string,
    birthdays: Celebrant[],
    anniversaries: Anniversary[],
  ): string {
    const lines: string[] = [heading];
    if (birthdays.length > 0) {
      lines.push(`🎂 Birthdays: ${birthdays.map((b) => b.name).join(', ')}`);
    }
    if (anniversaries.length > 0) {
      lines.push(
        `🎊 Work Anniversaries: ${anniversaries
          .map((a) => `${a.name} (${this.plural(a.years)})`)
          .join(', ')}`,
      );
    }
    return lines.join('\n');
  }

  /** Local calendar date as 'YYYY-MM-DD' (avoids toISOString's UTC shift). */
  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** 'HH:MM' → minutes past midnight, or null if unparseable. */
  private timeToMinutes(time: string): number | null {
    const match = /^(\d{1,2}):(\d{2})/.exec(time);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  private plural(years: number): string {
    return `${years} year${years === 1 ? '' : 's'}`;
  }
}
