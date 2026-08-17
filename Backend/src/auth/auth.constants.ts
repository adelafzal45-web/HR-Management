import type { JwtSignOptions } from '@nestjs/jwt';

/**
 * JWT configuration.
 *
 * In production the secret MUST come from the environment. The fallback keeps
 * local dev working without a .env file, matching the existing hardcoded-config
 * style of this repo (see data-source.ts).
 */
export const JWT_SECRET =
  process.env.JWT_SECRET ?? 'hrms-dev-secret-change-me-in-production';

/**
 * Access-token lifetime. Typed as `JwtSignOptions['expiresIn']` so the `ms`
 * string form ('15m') is accepted directly by `JwtModule.register` /
 * `signAsync` without per-call-site casts.
 *
 * Short by design: the refresh-token flow below silently mints a new access
 * token when this one expires, so a short window costs the user nothing and
 * bounds how long a leaked access token stays useful.
 */
export const JWT_EXPIRES_IN: JwtSignOptions['expiresIn'] = (process.env
  .JWT_EXPIRES_IN ?? '540m') as JwtSignOptions['expiresIn'];

/**
 * Refresh tokens are signed with a SEPARATE secret from access tokens. If they
 * shared one, an access token would verify as a refresh token and vice versa —
 * a stolen 15-minute access token could then be presented to /auth/refresh to
 * mint fresh credentials indefinitely.
 */
export const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ??
  'hrms-dev-refresh-secret-change-me-in-production';

/** Refresh-token lifetime. */
export const JWT_REFRESH_EXPIRES_IN: JwtSignOptions['expiresIn'] = (process.env
  .JWT_REFRESH_EXPIRES_IN ?? '7d') as JwtSignOptions['expiresIn'];

/** Refresh lifetime in ms, for computing the DB `expires_at` and cookie maxAge. */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Name of the httpOnly cookie carrying the refresh token. */
export const REFRESH_TOKEN_COOKIE = 'hrms_refresh_token';

/**
 * Path the refresh cookie is scoped to. Restricting it means the browser only
 * attaches it to the refresh/logout endpoints rather than every API call,
 * shrinking its exposure.
 */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';

/** Shape of the decoded JWT payload attached to `request.user`. */
export interface JwtUser {
  user_id: string;
  email: string;
  role: string | null;
}

/**
 * Claims carried by a refresh token. `jti` is the primary key of the
 * `refresh_tokens` row, so revocation and rotation can be enforced in the DB
 * rather than trusted from the signature alone.
 */
export interface RefreshTokenClaims {
  sub: string;
  jti: string;
}
