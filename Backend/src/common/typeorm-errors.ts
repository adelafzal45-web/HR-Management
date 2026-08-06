import { QueryFailedError } from 'typeorm';

/** Postgres: unique_violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * True when a failed write lost a race against a unique index.
 *
 * Two writers can both check "does this row exist", both see nothing, and both
 * insert; the index rejects the loser. That is not a server fault, so callers
 * use this to turn a 500 into whatever the situation actually calls for — a
 * 409 for a user-initiated submit, a logged no-op for a background write.
 *
 * The code is read from both `error.code` and `error.driverError.code` because
 * which one carries it depends on the driver version.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;

  const code = (error as QueryFailedError & { code?: string }).code;
  const driverCode = (error.driverError as { code?: string } | undefined)?.code;

  return code === UNIQUE_VIOLATION || driverCode === UNIQUE_VIOLATION;
}
