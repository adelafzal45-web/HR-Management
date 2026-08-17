import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  NAME_REGEX,
  NAME_MESSAGE,
  PHONE_REGEX,
  PHONE_MESSAGE,
  TrimOptional,
  NormalizeEmail,
} from './validation.constants';

/**
 * What an employee may change about themselves from /profile/edit.
 *
 * This is an allow-list by construction, not a subset of UpdateUserDto with
 * restrictions bolted on. Written as `PartialType(UpdateUserDto)` minus fields,
 * every new HR-controlled column added to the admin DTO in future would become
 * self-editable by default, and the omission list would have to be maintained
 * forever to prevent it. Declaring only the six permitted groups means the
 * failure mode is a missing field, not a privilege escalation.
 *
 * With the global ValidationPipe's `whitelist: true`, anything else in the body
 * — department_id, salary, role_id, employee_code, team_lead_id, joining_date,
 * the account flags — is stripped before the service ever sees it. The service
 * additionally never reads those keys off this type.
 *
 * Password changes are not here; they go through
 * `POST /users/me/change-password`, which requires the current password.
 */
export class UpdateOwnProfileDto {
  // --- Contact ---

  @ApiPropertyOptional({
    description:
      'Personal email. Subject to policy: the service rejects this when self-service email changes are disabled.',
  })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+92 300 1234567' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(20)
  @Matches(PHONE_REGEX, { message: `Phone ${PHONE_MESSAGE}` })
  phone?: string;

  // --- Photo ---

  @ApiPropertyOptional({
    description:
      'Path returned by POST /users/me/photo. Cleared by sending null.',
  })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(500)
  profile_image?: string;

  // --- Address ---

  @ApiPropertyOptional({
    example: 'House 12, Street 4, Gulberg III, Lahore, Punjab 54000, Pakistan',
  })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  // --- Emergency contact ---

  @ApiPropertyOptional({ example: 'Sara Khan' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(150)
  @Matches(NAME_REGEX, { message: `Emergency contact name ${NAME_MESSAGE}` })
  emergency_contact_name?: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(60)
  @Matches(NAME_REGEX, {
    message: `Emergency contact relationship ${NAME_MESSAGE}`,
  })
  emergency_contact_relationship?: string;

  @ApiPropertyOptional({ example: '+92 300 7654321' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(20)
  @Matches(PHONE_REGEX, { message: `Emergency contact phone ${PHONE_MESSAGE}` })
  emergency_contact_phone?: string;
}

/**
 * Field names an employee may change about themselves.
 *
 * Derived from the DTO's shape but declared explicitly so the service can
 * enforce the allow-list at assignment time as well — defence in depth in case
 * a route is ever wired up without the global ValidationPipe.
 */
export const SELF_EDITABLE_FIELDS = [
  'email',
  'phone',
  'profile_image',
  'address',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_phone',
] as const satisfies readonly (keyof UpdateOwnProfileDto)[];
