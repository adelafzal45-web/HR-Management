import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { PASSWORD_REGEX, PASSWORD_MESSAGE } from './validation.constants';

/**
 * Admin-initiated password reset for another employee.
 *
 * No current password is required — the caller is an administrator acting on
 * someone else's account, and requiring the target's existing password would
 * make the operation impossible for its actual purpose (a locked-out
 * employee). Authority comes from the `employees.password.reset` permission,
 * and the action is written to the audit trail.
 */
export class ResetPasswordDto {
  @ApiProperty({
    example: 'N3w@Password',
    description: 'Hashed with bcrypt before storage.',
  })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: `Password ${PASSWORD_MESSAGE}` })
  new_password!: string;

  @ApiPropertyOptional({
    description:
      'Reserved for a future "force change at next login" flow. Recorded in the audit entry.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  require_change_on_next_login?: boolean;
}

/**
 * Self-service password change, from /profile/edit.
 *
 * Unlike the admin reset above, this one DOES require the current password.
 * Without that check, anyone with a hijacked session or an unattended logged-in
 * machine could lock the real owner out of their account.
 */
export class ChangeOwnPasswordDto {
  @ApiProperty({ description: "The account holder's current password." })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  @MaxLength(128)
  current_password!: string;

  @ApiProperty({ example: 'N3w@Password' })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: `Password ${PASSWORD_MESSAGE}` })
  new_password!: string;
}
