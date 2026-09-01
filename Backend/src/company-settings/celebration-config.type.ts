/**
 * Shape of the admin-configurable celebration announcement (backlog #2b).
 *
 * The daily birthday & work-anniversary announcer (CelebrationSchedulerService)
 * reads this to decide *whether*, *when*, and under *what heading* to post. It is
 * stored as one nullable `jsonb` blob on `company_settings.celebration_config`
 * (mirroring `theme_config` / `biometric_device`) and edited on the Celebrations
 * settings screen. A null column means "no override" → the scheduler falls back
 * to CELEBRATION_CONFIG_DEFAULTS, which reproduce the original hard-coded
 * behaviour exactly (enabled, 08:00, the original heading). It is deliberately
 * NOT part of the public branding payload — nothing here is needed before login.
 *
 * The announcement is a single group post to everyone's bell + Slack: `heading`
 * is its title / first line, and the 🎂/🎊 celebrant list under it is composed
 * automatically. No per-person wishes are sent.
 *
 * Validation of an incoming object lives in `dto/celebration-config.dto.ts`;
 * this file is the read-side type used by the entity and the scheduler.
 */

export interface CelebrationConfig {
  /** Master switch for the daily automatic announcement. */
  enabled: boolean;
  /** Send time, 'HH:MM' 24-hour, server-local. */
  send_time: string;
  /** Announcement title + first line of the broadcast/Slack summary. */
  heading: string;
}

/**
 * The original hard-coded behaviour, applied whenever the column is null so an
 * existing install (and the seeded row) announces exactly as before until HR
 * changes something on the Celebrations settings screen.
 */
export const CELEBRATION_CONFIG_DEFAULTS: CelebrationConfig = {
  enabled: true,
  send_time: '08:00',
  heading: "🎉 Today's Celebrations",
};
