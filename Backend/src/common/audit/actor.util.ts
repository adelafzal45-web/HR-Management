import type { Request } from 'express';

import type { AuditActor } from '../../audit/audit.service';
import type { JwtUser } from '../../auth/auth.constants';

/**
 * Builds the audit actor from the verified token plus request metadata.
 *
 * Extracted because `UserController` already had a private copy of this and the
 * mail controllers need the same three lines. A shared helper keeps the shape of
 * an actor consistent across modules — an audit trail where `ip` is populated on
 * some rows and not others because one controller forgot it is materially less
 * useful during an investigation.
 *
 * Identity is taken from the JWT, never from the body or a header: a
 * client-supplied actor id would let any caller attribute their actions to
 * someone else, which is worse than having no trail at all.
 */
export function actorFrom(user: JwtUser, request: Request): AuditActor {
  return {
    user_id: user.user_id,
    email: user.email,
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
