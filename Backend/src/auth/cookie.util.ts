import type { CookieOptions, Response } from 'express';

import {
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Cookie flags for the refresh token.
 *
 * - `httpOnly` keeps it out of `document.cookie`, so an XSS payload can't read
 *   it the way it could read a token in localStorage.
 * - `secure` in production only; forcing it in dev would stop the cookie from
 *   being set over plain-HTTP localhost.
 * - `sameSite: 'lax'` blocks the cookie on cross-site subrequests while still
 *   allowing top-level navigation back into the app. 'strict' would be tighter
 *   but breaks returning from an external link, and CSRF risk on the refresh
 *   endpoint is limited: a forged refresh only rotates a token the attacker
 *   can't read.
 * - `path` scopes it to /api/auth, so it isn't attached to every API call.
 */
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
  };
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

/**
 * Clears the cookie. The flags must match those it was set with, or the browser
 * treats it as a different cookie and leaves the original in place.
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions());
}
