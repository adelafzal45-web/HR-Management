import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from './rate-limit.decorator';

/** How often the idle-bucket sweep is allowed to run. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface Bucket {
  /** Ascending hit timestamps, capped at the route's `limit` (see canActivate). */
  stamps: number[];
  /**
   * The window this bucket was created under, so the sweep knows when the bucket
   * is genuinely idle. Retention cannot be a single global constant: these
   * windows are an hour long, and evicting on a shorter fixed timer would reset
   * a live counter and hand the caller a fresh quota.
   */
  windowMs: number;
}

/**
 * In-memory sliding-window rate limiter.
 *
 * **This is per-process and non-persistent, by choice.** The application runs as
 * a single Node process today, so a shared store would add an operational
 * dependency to solve a problem that does not exist yet. Two consequences worth
 * knowing before that changes:
 *
 *   - Behind N instances, the effective limit is N x `limit`. Anything that must
 *     hold globally needs a shared store (Redis) instead.
 *   - Counters reset on restart, so a deploy forgives outstanding penalties.
 *
 * Neither is acceptable for a limiter defending a payment endpoint. Both are
 * fine for what this guards: making credential-stuffing and mail-flooding
 * expensive on password endpoints, where the real defences are the hashed
 * single-use token and the non-enumerable response.
 *
 * A sliding window rather than a fixed one: with fixed windows a caller gets
 * `2 x limit` requests through by straddling a boundary, which on a 5-per-hour
 * limit is the difference between 5 and 10 reset emails.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  private readonly buckets = new Map<string, Bucket>();

  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);

    // No decorator means no limit. The guard is deliberately inert rather than
    // applying a default, so mounting it globally later cannot start silently
    // throttling unrelated routes.
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.keyFor(request, context, options);
    const now = Date.now();

    this.sweep(now);

    const windowStart = now - options.windowMs;

    // Prior hits still inside the window, oldest first. The current request is
    // deliberately not included yet, so `length >= limit` reads as "the quota was
    // already spent before this call".
    const recent = (this.buckets.get(key)?.stamps ?? []).filter(
      (stamp) => stamp > windowStart,
    );

    const rejected = recent.length >= options.limit;

    // `retryAfter` is the time until the OLDEST counted hit leaves the window,
    // which is when a slot actually frees up. Computed before the array is
    // trimmed below, and reported instead of the full window length because the
    // latter would overstate the wait for a caller only marginally over.
    const retryAfterMs = rejected
      ? recent[0] + options.windowMs - now
      : 0;

    // The rejected attempt is counted too. Without this, a caller parked at the
    // limit is admitted again the instant one timestamp ages out, turning a hard
    // limit into a steady drip at exactly the limit rate.
    recent.push(now);

    // Only the newest `limit` hits can affect any future decision, so the rest
    // are discarded. This is what bounds memory per bucket no matter how hard a
    // caller hammers the endpoint.
    if (recent.length > options.limit) {
      recent.splice(0, recent.length - options.limit);
    }

    this.buckets.set(key, { stamps: recent, windowMs: options.windowMs });

    if (rejected) {
      const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));

      this.logger.warn(
        `Rate limit hit for ${key} (limit ${options.limit} per ${Math.round(options.windowMs / 1000)}s)`,
      );

      // The RFC 6585 header as well as the body field. HTTP clients, proxies and
      // fetch wrappers look for `Retry-After` and will never find a JSON key, so
      // omitting it leaves the standard signal unsent.
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', retryAfter);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many requests. Please try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
          error: 'Too Many Requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Builds the bucket key.
   *
   * The route is part of the key so two rate-limited endpoints never share a
   * quota — otherwise a user's forgot-password attempts would consume their
   * reset-password budget.
   */
  private keyFor(
    request: Request,
    context: ExecutionContext,
    options: RateLimitOptions,
  ): string {
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const ip = this.ipOf(request);

    if (options.keyBy === 'email+ip') {
      const body = (request.body ?? {}) as { email?: unknown };
      const email =
        typeof body.email === 'string'
          ? body.email.trim().toLowerCase()
          : 'anonymous';
      return `${route}|${email}|${ip}`;
    }

    return `${route}|${ip}`;
  }

  /**
   * Client address.
   *
   * `request.ip` already honours Express's `trust proxy` setting, so this does
   * not read `X-Forwarded-For` itself: doing so would let any caller spoof a
   * fresh identity per request with a header and bypass the limit entirely.
   */
  private ipOf(request: Request): string {
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  /**
   * Drops buckets whose newest hit is older than their own window.
   *
   * Without this the map is an unbounded leak keyed by client address. Done
   * inline on a timer rather than with `setInterval` so the guard holds no
   * handle that would keep the process alive or need teardown in tests.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) {
      return;
    }

    this.lastSweep = now;

    for (const [key, bucket] of this.buckets) {
      const newest = bucket.stamps[bucket.stamps.length - 1] ?? 0;
      if (newest <= now - bucket.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
