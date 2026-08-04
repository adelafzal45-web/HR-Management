import { EvaluationType } from '../appraisal-forms/appraisal-forms.entity';

/**
 * What a cadence needs to know about the world in order to answer "is a review
 * due today".
 *
 * `isWorkingDay` is passed in rather than the service itself, so a cadence has
 * no Nest dependency and can be unit-tested with a two-line stub. The
 * department/designation ids are carried because the working-day calendar is
 * resolved per scope (designation -> department -> global) — a Saturday-working
 * department must get its Weekly review on Saturday.
 */
export interface CadenceContext {
  departmentId?: string | null;
  designationId?: string | null;
  /**
   * The reviewee's shift start, in minutes past midnight. Daily reviews are
   * generated before the shift starts, so the reviewer has the placeholder
   * waiting when the day begins. Null when the employee has no shift, which is
   * treated as "any time on a working day will do".
   */
  shiftStartMinutes?: number | null;
  /** Minutes past midnight at the moment of the check. */
  nowMinutes: number;
  isWorkingDay(
    date: Date,
    departmentId?: string | null,
    designationId?: string | null,
  ): Promise<boolean>;
}

/**
 * One evaluation frequency.
 *
 * Two questions, deliberately separate:
 *
 *  - `periodKey` — which period does this date belong to. Feeds
 *    `review_period` and therefore `UQ_pr_reviewee_form_period`, so it must be
 *    stable for every date inside the period. A key that shifted with the run
 *    date would defeat the index that makes generation idempotent.
 *  - `isDueOn`   — should generation fire today. This is scheduling policy and
 *    is allowed to be picky about holidays and shift times.
 *
 * Adding Quarterly / Half-Yearly / Yearly means adding an object here plus one
 * value to the `evaluation_type` CHECK constraint. Nothing in the scheduler
 * changes, because the scheduler no longer knows the frequencies by name.
 */
export interface EvaluationCadence {
  readonly type: EvaluationType;
  /** Human-readable, for logs and for the form editor's schedule cards. */
  readonly label: string;
  periodKey(date: Date): string;
  isDueOn(date: Date, ctx: CadenceContext): Promise<boolean>;
  /**
   * The last calendar date in the period containing `date`. Used by the
   * scheduler's backfill to tell "this period is still open, wait for its due
   * day" apart from "this period has closed and we never generated it".
   */
  periodEnd(date: Date): Date;
  /** The first calendar date in the period containing `date`. */
  periodStart(date: Date): Date;
  /**
   * How many already-closed periods to backfill if they were missed.
   *
   * The safety net for "the app was down on the last working day of the month".
   * Zero for Daily: a missed day is genuinely gone, and resurrecting it every
   * morning would hand leads a growing pile of stale placeholders instead of
   * today's work. One is enough for Weekly and Monthly, where a lost period is
   * a lost reporting cycle.
   */
  readonly backfillPeriods: number;
}

// ---------------------------------------------------------------------------
// Date helpers. Local-time throughout: a review period is a human calendar
// concept, and going via toISOString would shift it by the UTC offset.
// ---------------------------------------------------------------------------

/** Local calendar date as 'YYYY-MM-DD'. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

/** ISO-8601 week number: weeks start Monday, week 1 holds the first Thursday. */
export function isoWeek(date: Date): number {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

/**
 * The ISO year the week number belongs to, which is not always the calendar
 * year. 1 Jan 2027 falls in ISO week 53 of 2026; keying it as `2027-W53` would
 * put it in a week that does not exist and split one period across two keys.
 */
export function isoWeekYear(date: Date): number {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  return target.getUTCFullYear();
}

/** Midnight local time on the same calendar day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Sunday of the ISO week containing `date`. */
function endOfIsoWeek(date: Date): Date {
  const isoDay = startOfDay(date).getDay() || 7;
  return addDays(date, 7 - isoDay);
}

/** Monday of the ISO week containing `date`. */
function startOfIsoWeek(date: Date): Date {
  const isoDay = startOfDay(date).getDay() || 7;
  return addDays(date, 1 - isoDay);
}

/** Last calendar day of the month containing `date`. */
function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** First calendar day of the month containing `date`. */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Walks backwards from `periodEnd` to the last working day of the period.
 *
 * Bounded by `maxLookback` so a scope with no working days configured at all
 * cannot spin — it returns null instead, and the caller treats that as "this
 * period has no working day, so nothing is due".
 */
async function lastWorkingDay(
  periodEnd: Date,
  ctx: CadenceContext,
  maxLookback: number,
): Promise<Date | null> {
  for (let back = 0; back < maxLookback; back++) {
    const candidate = addDays(periodEnd, -back);
    const working = await ctx.isWorkingDay(
      candidate,
      ctx.departmentId,
      ctx.designationId,
    );
    if (working) return candidate;
  }
  return null;
}

function sameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

// ---------------------------------------------------------------------------
// The cadences
// ---------------------------------------------------------------------------

/**
 * How early before shift start a Daily review may be generated.
 *
 * Generous on purpose. The generation job runs hourly, so a tight window would
 * be missed entirely whenever the tick lands on the wrong side of it; and a
 * placeholder created too early is harmless, whereas one created after the
 * shift has begun is late.
 */
const PRE_SHIFT_WINDOW_MINUTES = 180;

const DAILY: EvaluationCadence = {
  type: EvaluationType.DAILY,
  label: 'Every working day, before the shift starts',
  // A missed day is gone. Resurrecting it tomorrow morning would hand leads a
  // growing pile of stale placeholders instead of today's actual work.
  backfillPeriods: 0,

  periodKey: (date) => dateKey(date),

  periodEnd: (date) => startOfDay(date),
  periodStart: (date) => startOfDay(date),

  async isDueOn(date, ctx) {
    const working = await ctx.isWorkingDay(
      date,
      ctx.departmentId,
      ctx.designationId,
    );
    if (!working) return false;

    // No shift on file means no shift start to be "before", so any working-day
    // tick generates. Refusing here would leave shiftless employees with no
    // evaluations at all.
    if (ctx.shiftStartMinutes === null || ctx.shiftStartMinutes === undefined) {
      return true;
    }

    // Before the shift starts, or within the pre-shift window. Once the shift
    // has begun we still generate — being late is better than skipping the day
    // outright, and the unique index means the earlier tick already won if it
    // fired.
    return ctx.nowMinutes >= ctx.shiftStartMinutes - PRE_SHIFT_WINDOW_MINUTES;
  },
};

const WEEKLY: EvaluationCadence = {
  type: EvaluationType.WEEKLY,
  label: 'On the last working day of each week',
  // One week back. A lost week is a lost reporting cycle, but reaching further
  // would resurrect periods nobody is still thinking about.
  backfillPeriods: 1,

  periodKey: (date) =>
    `${isoWeekYear(date)}-W${String(isoWeek(date)).padStart(2, '0')}`,

  periodEnd: (date) => endOfIsoWeek(date),
  periodStart: (date) => startOfIsoWeek(date),

  async isDueOn(date, ctx) {
    const due = await lastWorkingDay(endOfIsoWeek(date), ctx, 7);
    if (!due) return false;
    // On or after the due day. "After" only happens inside the same week, since
    // the period key changes at the week boundary — later weeks are handled by
    // the scheduler's closed-period backfill instead.
    return startOfDay(date).getTime() >= due.getTime();
  },
};

const MONTHLY: EvaluationCadence = {
  type: EvaluationType.MONTHLY,
  label: 'On the last working day of each month',
  backfillPeriods: 1,

  periodKey: (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,

  periodEnd: (date) => endOfMonth(date),
  periodStart: (date) => startOfMonth(date),

  async isDueOn(date, ctx) {
    const due = await lastWorkingDay(endOfMonth(date), ctx, 31);
    if (!due) return false;
    return startOfDay(date).getTime() >= due.getTime();
  },
};

/**
 * Every frequency the system generates for, keyed by the stored
 * `evaluation_type`.
 *
 * `evaluation_type` is a varchar guarded by a CHECK constraint rather than a
 * Postgres enum, precisely so a new cadence is an ALTER plus an entry here.
 */
export const CADENCES: Record<EvaluationType, EvaluationCadence> = {
  [EvaluationType.DAILY]: DAILY,
  [EvaluationType.WEEKLY]: WEEKLY,
  [EvaluationType.MONTHLY]: MONTHLY,
};

/**
 * Looks up a cadence, falling back to Daily for an unrecognised value.
 *
 * A form whose type is not in the map would otherwise crash the generation job
 * for every other form in the same pass — a bad row must not stop the whole
 * schedule. Daily is the safe fallback: it generates the most often, so the
 * failure mode is noticeable rather than silent.
 */
export function cadenceFor(type: EvaluationType | string): EvaluationCadence {
  return CADENCES[type as EvaluationType] ?? DAILY;
}

/** True when `date` sits in a period that has already closed. */
export function isPeriodClosed(
  cadence: EvaluationCadence,
  periodDate: Date,
  now: Date,
): boolean {
  return startOfDay(now).getTime() > cadence.periodEnd(periodDate).getTime();
}

/**
 * The `count` closed periods immediately before the one containing `from`,
 * newest first, as a representative date inside each.
 *
 * Derived by stepping back one day from each period's start rather than by
 * knowing how long a period is — so this keeps working for Quarterly and
 * Yearly without being told anything about them.
 */
export function previousPeriods(
  cadence: EvaluationCadence,
  from: Date,
  count: number,
): Date[] {
  const periods: Date[] = [];
  let cursor = startOfDay(from);

  for (let i = 0; i < count; i++) {
    cursor = addDays(cadence.periodStart(cursor), -1);
    periods.push(cursor);
  }

  return periods;
}

export {
  sameDay,
  startOfDay,
  addDays,
  startOfIsoWeek,
  endOfIsoWeek,
  startOfMonth,
  endOfMonth,
  lastWorkingDay,
};
