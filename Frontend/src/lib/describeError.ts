// ============================================================================
// One place that turns a thrown error into a sentence a user can read.
//
// Every data screen ends up needing the same mapping: an `ApiError` carries a
// numeric `status` and often a server message, and each status means something
// specific to the person looking at the screen — a 403 is "you can't see this",
// a 409 is "that clashes with something", a 0 is "the network didn't answer".
// Before this existed, that ladder was re-typed (slightly differently) in every
// catch block; the good short version already lived in PeriodStatCards' local
// `describe(reason)`, and this is that idea generalised so the hook, the
// DataTable error state, and toast handlers all speak with one voice.
//
// Deliberately NOT a fallback: this never invents data, it only names the
// failure. Callers show the message and a Retry — they do not swallow it.
// ============================================================================

import { ApiError } from "./apiClient";

/**
 * A user-facing sentence for any thrown value.
 *
 * Prefers the backend's own `message` for the client-error range (400/409/422
 * and friends), because those are written for the end user ("Email already in
 * use", "Check-out must be after check-in") and are more specific than anything
 * generic. For the status codes where the server message tends to be noise (a
 * bare "Forbidden", a stack-trace-ish 500), a fixed, calmer sentence is used.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      // 0 is this client's own "fetch threw" / "timed out" sentinel — the
      // request never reached the server, so its own message is the useful one.
      case 0:
        return error.message || "Can't reach the server. Check your connection and try again.";
      case 400:
        return serverMessageOr(error, "That request wasn't valid. Please check the form and try again.");
      case 401:
        return "Your session has expired. Please sign in again.";
      case 403:
        return "You don't have permission to view this.";
      case 404:
        return "We couldn't find what you were looking for.";
      case 409:
        return serverMessageOr(error, "That conflicts with existing data.");
      case 422:
        return serverMessageOr(error, "Some of the details couldn't be processed. Please review and try again.");
      case 429:
        return "Too many requests. Please wait a moment and try again.";
      case 500:
      case 502:
      case 503:
      case 504:
        return "The server ran into a problem. Please try again shortly.";
      default:
        return serverMessageOr(error, `Something went wrong (${error.status}).`);
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

/**
 * The compact variant for tight spaces (stat tiles, inline cells) — status
 * only, no server prose. This is PeriodStatCards' original `describe`, kept
 * available so those cards can drop their private copy without changing what
 * they render.
 */
export function describeErrorShort(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Unavailable";
    if (error.status === 403) return "Not permitted";
    return `Unavailable (${error.status})`;
  }
  return "Unavailable";
}

/** True when the failure is a permission problem — callers sometimes hide the retry for these. */
export function isPermissionError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

/** Use the server's own message when it's a non-empty string, else the fallback. */
function serverMessageOr(error: ApiError, fallback: string): string {
  const msg = error.message?.trim();
  // `Request failed (400)` is this client's own placeholder when the body had
  // no message — not worth showing over the friendlier fallback.
  if (msg && !/^(Request|Upload|Export) failed \(\d+\)$/.test(msg)) {
    return msg;
  }
  return fallback;
}
