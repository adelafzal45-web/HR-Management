/**
 * Today's birthdays and work anniversaries, as both the dashboard widget and the
 * daily announcer consume them.
 *
 * Deliberately carries no birth year or age — only the name, designation and
 * avatar an org would put on a celebration board. `years` is a derived count
 * (this calendar year minus the joining year), never the joining date itself.
 */
export interface Celebrant {
  user_id: string;
  name: string;
  designation: string | null;
  avatar_url: string | null;
}

export interface Anniversary extends Celebrant {
  /** Completed years of service as of today; always >= 1. */
  years: number;
}

export interface TodaysCelebrations {
  /** The local calendar date these were computed for, 'YYYY-MM-DD'. */
  as_of: string;
  birthdays: Celebrant[];
  anniversaries: Anniversary[];
}

/**
 * Stamped on every celebration notification row. The daily job counts rows
 * carrying this to decide whether it has already run today (idempotency), so it
 * must stay in sync with the value the scheduler writes.
 */
export const CELEBRATION_REFERENCE_TYPE = 'Celebration';

/**
 * Outcome of one announcement run. Returned by the manual "Send now" endpoint
 * (so the settings screen can toast what happened) and logged by the scheduled
 * tick. `announced` is false when nothing was sent — `reason` says why:
 * 'no-celebrations' (nobody today), 'already-announced' (the scheduled guard
 * already fired today; only the scheduled tick produces this), or 'busy' (a run
 * was already in flight). Counts are of today's celebrants; `informed` is how
 * many people received the broadcast bell. `slack` echoes SlackService's own
 * result — never a token, only whether it sent and why not.
 */
export interface AnnouncementResult {
  announced: boolean;
  reason?: 'no-celebrations' | 'already-announced' | 'busy';
  birthdays: number;
  anniversaries: number;
  informed: number;
  slack: { sent: boolean; reason?: string };
}
