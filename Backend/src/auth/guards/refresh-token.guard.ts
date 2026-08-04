import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { REFRESH_TOKEN_COOKIE } from '../auth.constants';

/** The refresh token lifted off the request, for the route handler to consume. */
export interface RefreshTokenRequest extends Request {
  refreshToken: string;
}

/**
 * Guard for the refresh endpoints — deliberately separate from JwtAuthGuard.
 *
 * The two authenticate different credentials in different places: JwtAuthGuard
 * reads a short-lived access token from the Authorization header, this one
 * reads the long-lived refresh token from an httpOnly cookie. Keeping them
 * apart is what stops an access token from being accepted as a refresh token.
 *
 * It intentionally does NOT verify the signature or attach `request.user`:
 * signature, expiry, and revocation are all checked together in
 * RefreshTokenService.rotate(), against the database. A token that verifies but
 * has been revoked must still be rejected, so there is no useful "authenticated"
 * state to establish here.
 *
 * Routes using this guard must also be marked @Public() so the global
 * JwtAuthGuard doesn't demand an access token that has, by definition, expired.
 */
@Injectable()
export class RefreshTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = (request.cookies ?? {}) as Record<string, string>;
    const token = cookies[REFRESH_TOKEN_COOKIE];

    if (!token) {
      throw new UnauthorizedException('Refresh token cookie is missing');
    }

    (request as RefreshTokenRequest).refreshToken = token;
    return true;
  }
}
