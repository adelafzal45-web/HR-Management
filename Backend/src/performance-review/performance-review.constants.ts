/**
 * Statuses that make a review read-only.
 *
 * `Draft` is the only writable state — it covers both a scheduler-generated
 * placeholder and a review HR has reopened. Everything else has been submitted,
 * which means someone may already have acted on the numbers.
 *
 * Shared rather than duplicated: the facade uses it to reject edits, and the
 * absence path uses it to decide whether it may take over the row it found.
 */
export const LOCKED_REVIEW_STATUSES = ['Submitted', 'Approved', 'Rejected'];
