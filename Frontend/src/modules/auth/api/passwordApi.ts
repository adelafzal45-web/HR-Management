// ============================================================================
// Password recovery API — forgot / validate / reset, plus the admin-issued
// reset links.
//
// Deliberately NOT in `@/api/client`. Every call there is wrapped in
// `withDemoFallback`, which answers from a mock store when the backend is
// unreachable. For a password operation that behaviour is worse than an
// outright failure: the user is told their password changed when nothing
// happened, and they discover otherwise at the next login — by which point
// they no longer know which password is live. These functions talk to the real
// API or throw.
//
// Route inventory (Backend/src/auth/auth.controller.ts and
// password-reset-admin.controller.ts):
//
//   POST /auth/forgot-password              @Public, 5/hr per email+IP
//   GET  /auth/reset-password/validate      @Public
//   POST /auth/reset-password               @Public, 10/hr per IP
//   POST /users/password-reset-links        employees.password.reset
//   GET  /users/:id/password-reset-links    employees.password.reset
//
// Bodies are snake_case. The global ValidationPipe runs with
// `whitelist: true`, which *strips* unknown keys rather than rejecting them —
// a camelCase body therefore arrives empty and fails on a confusing
// "should not be empty" instead of a naming error.
// ============================================================================

import { api, ENDPOINTS } from "@/lib/apiClient";

/**
 * Mirrors PASSWORD_REGEX in Backend/src/users/dto/validation.constants.ts.
 *
 * Client-side only so the form can fail fast with a readable message. The
 * backend enforces the same rule plus the last-5 reuse-history check, which
 * cannot be done here — never treat a pass here as a guarantee of acceptance.
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const PASSWORD_MESSAGE =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

/**
 * The backend answers this identically whether or not the address belongs to
 * an account, so there is nothing here to branch on. Rendering a different
 * message for "no such user" would turn the endpoint into an account
 * enumerator, which is exactly what the deliberately vague copy avoids.
 */
export type ForgotPasswordResult = { message: string };

export type ValidateResetTokenResult = {
  valid: boolean;
  /** Present only when `valid` is false — safe to show verbatim. */
  reason?: string;
  /** Masked by the server (e.g. `a•••@example.com`); never the full address. */
  email?: string;
};

export type ResetPasswordResult = { message: string };

export type ResetLinkStatus = "sent" | "skipped" | "failed";

export type BulkPasswordResetResult = {
  user_id: string;
  status: ResetLinkStatus;
  /** Why it was skipped or how it failed. Absent on success. */
  reason?: string;
  email?: string;
  expires_at?: string;
};

export type BulkPasswordResetSummary = {
  requested: number;
  sent: number;
  skipped: number;
  failed: number;
  results: BulkPasswordResetResult[];
};

export type PasswordResetLinkHistoryEntry = {
  password_reset_token_id: string;
  delivery_email: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  invalidated_at: string | null;
  created_by_user_id: string | null;
  status: "used" | "expired" | "superseded" | "pending";
};

/** Matches MAX_RESET_LINK_BATCH in Backend/src/auth/dto/bulk-password-reset.dto.ts. */
export const MAX_RESET_LINK_BATCH = 100;

export const passwordApi = {
  /**
   * Requests a reset link. `skipAuth` because the route is @Public and the
   * caller is by definition someone who cannot log in — sending a stale
   * Authorization header would only invite a pointless refresh attempt.
   */
  forgotPassword: (email: string) =>
    api.post<ForgotPasswordResult>(
      ENDPOINTS.auth.forgotPassword,
      { email },
      { skipAuth: true, skipRefresh: true },
    ),

  /**
   * Checks a token before rendering the form, so an expired or already-used
   * link says so up front instead of after the user has typed a new password
   * twice.
   */
  validateResetToken: (token: string, signal?: AbortSignal) =>
    api.get<ValidateResetTokenResult>(
      `${ENDPOINTS.auth.validateResetToken}?token=${encodeURIComponent(token)}`,
      { skipAuth: true, skipRefresh: true, signal },
    ),

  /**
   * The token goes in the body, not the query string — query strings land in
   * server access logs, browser history and `Referer` headers, and this one is
   * a bearer credential for the account.
   */
  resetPassword: (token: string, newPassword: string) =>
    api.post<ResetPasswordResult>(
      ENDPOINTS.auth.resetPassword,
      { token, new_password: newPassword },
      { skipAuth: true, skipRefresh: true },
    ),
};

export const adminPasswordResetApi = {
  /**
   * Issues reset links for up to {@link MAX_RESET_LINK_BATCH} employees.
   *
   * Always resolves 200 for a well-formed request, even when some or all
   * targets were skipped — "3 of 5 sent" is not something a single status code
   * can express, so the per-user outcome is in the body and the caller must
   * render it.
   */
  sendLinks: (userIds: string[]) =>
    api.post<BulkPasswordResetSummary>(ENDPOINTS.users.passwordResetLinks, {
      user_ids: userIds,
    }),

  /** Up to 20 most recent links issued for one employee, newest first. */
  history: (userId: string, signal?: AbortSignal) =>
    api.get<PasswordResetLinkHistoryEntry[]>(
      ENDPOINTS.users.passwordResetLinkHistory(userId),
      { signal },
    ),
};
