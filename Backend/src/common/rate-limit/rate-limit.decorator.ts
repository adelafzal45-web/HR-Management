import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * What the limiter counts requests against.
 *
 * - `ip` — one bucket per client address. The right default.
 * - `email+ip` — one bucket per (body.email, address) pair. For endpoints where
 *   the interesting abuse is hammering *one* account: it stops a single mailbox
 *   being flooded with reset mail without letting one NAT'd office share a
 *   single quota.
 */
export type RateLimitKeyBy = 'ip' | 'email+ip';

export interface RateLimitOptions {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  keyBy?: RateLimitKeyBy;
}

/**
 * Rate-limits a route. Requires `RateLimitGuard` on the same handler or
 * controller — the decorator only carries metadata and enforces nothing alone.
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
