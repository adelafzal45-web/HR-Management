import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JWT_SECRET, JwtUser } from '../auth.constants';

/**
 * Global authentication guard.
 *
 * Verifies the `Authorization: Bearer <token>` header and attaches the decoded
 * user to `request.user`. Routes marked `@Public()` are skipped.
 *
 * Registered as an APP_GUARD (see AuthModule), so it runs before the
 * per-route PermissionGuard, which then reads `request.user.user_id`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is missing');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        role: string | null;
      }>(token, { secret: JWT_SECRET });

      const user: JwtUser = {
        user_id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      (request as Request & { user: JwtUser }).user = user;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
