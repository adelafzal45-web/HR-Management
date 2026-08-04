import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../auth.constants';

/**
 * Injects the authenticated user (from the verified JWT) into a handler:
 *   findMine(@CurrentUser() user: JwtUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtUser | undefined = request.user;
    return data ? user?.[data] : user;
  },
);
