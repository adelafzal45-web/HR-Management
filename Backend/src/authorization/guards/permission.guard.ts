import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

import { AuthorizationService } from '../authorization.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permission from the endpoint
    const permissionName = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Endpoint does not require permission
    if (!permissionName) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { user_id?: string } }>();

    // Identity comes from the verified JWT that the global JwtAuthGuard put on
    // the request — never from a client-supplied header, which a caller could
    // set to any user id to impersonate them.
    const userId = request.user?.user_id;

    if (!userId) {
      throw new UnauthorizedException('Authentication is required');
    }

    const hasPermission = await this.authorizationService.hasPermission(
      userId,
      permissionName,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `You do not have permission: ${permissionName}`,
      );
    }

    return true;
  }
}
