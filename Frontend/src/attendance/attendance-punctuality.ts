/**
 * How an employee's two stamps compare to the shift they were supposed to work.
 *
 * `attendance_status` answers "did they come in?" — Present, Late, Absent. It
 * says nothing about *leaving*: someone who arrived on time and left three hours
 * into an eight-hour shift is stored as plain `Present`, which is exactly how a
 * short day disappears from a report. These flags are the missing half.
 *
 * They are derived on read rather than stored. A shift's `start_time` or
 * `grace_period_minutes` can be corrected after the fact, and a stored flag
 * would then describe a schedule that no longer exists; deriving means the
 * answer always reflects the shift the row is currently attached to. It also
 * needs no migration and cannot drift from `attendance_status`, which is
 * computed from the same shift by `resolveArrivalStatus`.
 */

/** Minutes in a day — used to unwrap a shift that crosses midnight. */
const MINUTES_PER_DAY = 1440;

/**
 * How far either side of a shift boundary still counts as "on time".
 *
 * Applied to check-out and to early arrivals. Late arrivals use the shift's own
 * `grace_period_minutes` instead, so this constant never overrides a grace
 * period HR configured deliberately.
 */
const PUNCTUALITY_TOLERANCE_MINUTES = 5;

export type Punctuality = 'early' | 'on-time' | 'late';

export type AttendancePunctuality = {
  /** How the arrival compared to `shift.start_time`. Null with no shift/stamp. */
  check_in_punctuality: Punctuality | null;
  /** Minutes early (negative) or late (positive) against the shift start. */
  check_in_variance_minutes: number | null;
  /** How the departure compared to `shift.end_time`. Null with no shift/stamp. */
  check_out_punctuality: Punctuality | null;
  /** Minutes early (negative) or late (positive) against the shift end. */
  check_out_variance_minutes: number | null;
};

/** Nothing to compare against — no shift assigned, or the day never started. */
export const NO_PUNCTUALITY: AttendancePunctuality = {
  check_in_punctuality: null,
  check_in_variance_minutes: null,
  check_out_punctuality: null,
  check_out_variance_minutes: null,
};

/** "HH:mm:ss" (or "HH:mm") to minutes since midnight. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Signed distance from a shift boundary, in minutes, unwrapped across midnight.
 *
 * A raw subtraction reads a 22:00 shift stamped at 22:10 as 1330 minutes early
 * rather than 10 late. Half a day either side is the widest window in which a
 * stamp still plausibly belongs to this shift; past it, the clock has wrapped.
 */
function varianceFrom(boundary: string, stamp: string): number {
  let offset = minutesOf(stamp) - minutesOf(boundary);
  if (offset < -MINUTES_PER_DAY / 2) offset += MINUTES_PER_DAY;
  if (offset > MINUTES_PER_DAY / 2) offset -= MINUTES_PER_DAY;
  return offset;
}

export function derivePunctuality(input: {
  checkIn?: string | null;
  checkOut?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  graceMinutes?: number | null;
}): AttendancePunctuality {
  const { checkIn, checkOut, shiftStart, shiftEnd } = input;

  const result: AttendancePunctuality = { ...NO_PUNCTUALITY };

  if (checkIn && shiftStart) {
    const variance = varianceFrom(shiftStart, checkIn);
    // Lateness uses the shift's configured grace period so this agrees with
    // `attendance_status`; earliness uses the flat tolerance, since a grace
    // period is a licence to arrive late, not a window before the shift.
    const grace = Math.max(0, input.graceMinutes ?? 0);

    result.check_in_variance_minutes = variance;
    result.check_in_punctuality =
      variance > grace
        ? 'late'
        : variance < -PUNCTUALITY_TOLERANCE_MINUTES
          ? 'early'
          : 'on-time';
  }

  if (checkOut && shiftEnd) {
    const variance = varianceFrom(shiftEnd, checkOut);

    result.check_out_variance_minutes = variance;
    result.check_out_punctuality =
      variance < -PUNCTUALITY_TOLERANCE_MINUTES
        ? 'early'
        : variance > PUNCTUALITY_TOLERANCE_MINUTES
          ? 'late'
          : 'on-time';
  }

  return result;
}

export { PUNCTUALITY_TOLERANCE_MINUTES };
