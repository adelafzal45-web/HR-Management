import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — the global JwtAuthGuard skips token verification.
 * Use on login and any other unauthenticated endpoint.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
