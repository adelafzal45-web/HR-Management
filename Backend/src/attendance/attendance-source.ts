/**
 * Where an attendance record came from.
 *
 * `Online` is the default: self-service check-in/out and remote manual entries
 * are recorded online. `Device` marks a record that originated from (or is being
 * attributed to) a physical attendance device — biometric/RFID terminal — so a
 * report can tell a remote punch apart from an on-premises one.
 *
 * A `const` tuple rather than a TS `enum` for the same reason as
 * `ATTENDANCE_STATUSES`: the one array feeds both the DTO's `@IsIn()` and the
 * service, so the validator and the business rules cannot drift apart.
 */
export const ATTENDANCE_SOURCES = ['Device', 'Online'] as const;

export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

/** Source assumed when a caller does not specify one. */
export const DEFAULT_ATTENDANCE_SOURCE: AttendanceSource = 'Online';

/**
 * Maps an incoming source onto the canonical spelling, falling back to the
 * default when nothing (or nothing recognisable) was supplied.
 *
 * The DTO's `@IsIn` already rejects a bad value on the HTTP path; this makes the
 * service tolerant of the scheduler / seeds / self-service paths that pass no
 * source at all, so they land on `Online` rather than a blank column.
 */
export function normaliseSource(value?: string | null): AttendanceSource {
  if (!value) return DEFAULT_ATTENDANCE_SOURCE;
  const match = ATTENDANCE_SOURCES.find(
    (source) => source.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? DEFAULT_ATTENDANCE_SOURCE;
}
