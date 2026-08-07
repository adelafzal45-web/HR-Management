import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ATTENDANCE_STATUSES } from '../attendance-status';

/** "HH:mm:ss" on a 24-hour clock. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

/**
 * An upper bound on a single day's hours.
 *
 * 24 is the arithmetic ceiling, but a 24-hour shift is a data-entry mistake
 * every time, and `working_hours` is `decimal(5,2)` — so without a bound the
 * DTO happily accepts 999.99 and the column stores it.
 */
const MAX_HOURS_PER_DAY = 20;

export class CreateAttendanceDto {
  @ApiPropertyOptional({
    description:
      'The employee this record belongs to. Omit to file it against the ' +
      'caller. Only honoured on the permission-guarded HR route, which is ' +
      'the whole point of it: marking attendance for someone who forgot to ' +
      'clock in is an HR correction, not an employee action.',
  })
  @IsOptional()
  @IsUUID('4')
  user_id?: string;

  @ApiProperty({
    example: '2026-07-22',
    description: 'Attendance date (YYYY-MM-DD)',
  })
  @IsDateString()
  attendance_date!: Date;

  @ApiPropertyOptional({
    example: '09:00:00',
    description:
      'Employee check-in time (HH:mm:ss). Required for Present, Late and ' +
      'Half-Day; must be omitted for Absent, On Leave and Non-Working.',
  })
  // Optional since `attendance.check_in` became nullable: an Absent or On Leave
  // day has no arrival time by definition. Which statuses may omit it — and
  // which must — is enforced in the service, where the status is known.
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'check_in must be in HH:mm:ss format',
  })
  check_in?: string;

  @ApiPropertyOptional({
    example: '18:00:00',
    description: 'Employee check-out time (HH:mm:ss)',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'check_out must be in HH:mm:ss format',
  })
  check_out?: string;

  @ApiPropertyOptional({
    example: 8,
    description:
      'Total working hours. Recomputed from the two stamps when both are ' +
      'present, so this is only read for a stamp-less correction.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_HOURS_PER_DAY)
  working_hours?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Overtime hours worked',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_HOURS_PER_DAY)
  overtime_hours?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether the employee worked overtime. Derived from overtime_hours ' +
      'when hours are computed, so a conflicting value is rejected.',
  })
  @IsOptional()
  @IsBoolean()
  is_overtime?: boolean;

  @ApiProperty({
    example: 'Present',
    enum: ATTENDANCE_STATUSES,
    description: 'Attendance status',
  })
  // An allow-list rather than a free `varchar(20)`: the column had no check
  // constraint, so a typo like "Pressent" was accepted and then silently
  // excluded from every present/absent count that compares on the exact string.
  @IsIn(ATTENDANCE_STATUSES, {
    message: `attendance_status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`,
  })
  attendance_status!: string;
}

export { MAX_HOURS_PER_DAY };
