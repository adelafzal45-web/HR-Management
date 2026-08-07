import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * Admin/HR edit payload — every employee field is updatable, except the
 * password.
 *
 * Password changes are deliberately excluded and routed through
 * `POST /users/:id/reset-password` instead. Folding them in here would mean a
 * routine profile edit and a credential reset are the same audited action and
 * carry the same permission, so "who reset this person's password" becomes
 * unanswerable. `employees.password.reset` guards that endpoint separately.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}
