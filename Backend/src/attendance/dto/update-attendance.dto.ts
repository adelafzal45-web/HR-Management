import { OmitType, PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

import { CreateAttendanceDto } from './create-attendance.dto';

/** "HH:mm:ss" on a 24-hour clock. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

/**
 * Everything on the create DTO, all optional — plus the ability to *clear* a
 * stamp rather than only set one.
 *
 * The two overridden fields exist for that distinction alone. `PartialType`
 * gives `check_in?: string`, where omitting the key and sending `null` are
 * indistinguishable once the object reaches the service, so there is no way to
 * express "this day was wrongly recorded as Present — remove the check-in and
 * file it as Absent". Accepting `null` explicitly is what makes the correction
 * dialog's status change work, and `@ValidateIf` skips the format check for it
 * so a deliberate null is not rejected as a malformed time.
 */
export class UpdateAttendanceDto extends PartialType(
  OmitType(CreateAttendanceDto, ['check_in', 'check_out'] as const),
) {
  @ApiPropertyOptional({
    example: '09:00:00',
    nullable: true,
    description:
      'Check-in time (HH:mm:ss). Send null to clear it, e.g. when correcting ' +
      'a day to Absent or On Leave.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(TIME_PATTERN, { message: 'check_in must be in HH:mm:ss format' })
  check_in?: string | null;

  @ApiPropertyOptional({
    example: '18:00:00',
    nullable: true,
    description: 'Check-out time (HH:mm:ss). Send null to clear it.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(TIME_PATTERN, { message: 'check_out must be in HH:mm:ss format' })
  check_out?: string | null;
}
