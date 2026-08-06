/**
 * The complete set of values `attendance.attendance_status` may hold.
 *
 * The column is a plain `varchar(20)` with no check constraint, and until now
 * nothing validated what went into it: `POST /attendance` took whatever string
 * the client sent. The five statuses below are the ones actually in the live
 * table, plus `Non-Working`, which `AttendanceService.create` already assigns
 * for a day the employee is not scheduled to work.
 *
 * Kept as a `const` tuple rather than a TypeScript `enum` so the same array can
 * be handed to `@IsIn()` in the DTO and to the runtime checks in the service —
 * one list, so the validator and the business rules cannot drift apart.
 */
export const ATTENDANCE_STATUSES = [
  'Present',
  'Late',
  'Half-Day',
  'Absent',
  'On Leave',
  'Non-Working',
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Status used for days the company does not operate. */
export const NON_WORKING_STATUS: AttendanceStatus = 'Non-Working';

/**
 * Statuses that mean the employee was at work, so a check-in time is required.
 *
 * `Half-Day` is included: it describes a short attendance, not an absence, and
 * a half day with no arrival time is unauditable.
 */
export const STATUSES_REQUIRING_CHECK_IN: readonly AttendanceStatus[] = [
  'Present',
  'Late',
  'Half-Day',
];

/**
 * Statuses that mean the employee was not at work, so stamps and hours must be
 * empty. Recording `Absent` alongside a check-in and eight working hours is the
 * kind of contradiction that quietly corrupts both payroll and the auto-zero
 * appraisal that `Absent` triggers.
 */
export const STATUSES_FORBIDDING_CHECK_IN: readonly AttendanceStatus[] = [
  'Absent',
  'On Leave',
  'Non-Working',
];

/** Case-insensitive membership test, for comparing against stored values. */
export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return ATTENDANCE_STATUSES.some(
    (status) => status.toLowerCase() === value.toLowerCase(),
  );
}
