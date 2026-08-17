import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ATTENDANCE_STATUSES } from '../attendance-status';
import { ATTENDANCE_SOURCES } from '../attendance-source';

/** "HH:mm:ss" on a 24-hour clock. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

/**
 * A bound on one bulk call.
 *
 * Each employee costs a working-day lookup and an insert, and the whole run is
 * one request; without a ceiling a mistyped filter turns into an unbounded write
 * loop holding a connection open. 500 covers marking a whole company for a day.
 */
const MAX_BULK_EMPLOYEES = 500;

/**
 * Marking one date for many employees at once — the "mark everyone absent for
 * the shutdown day" case that otherwise means several hundred manual rows.
 *
 * Deliberately narrow: one date, one status, one optional pair of stamps for
 * everybody in the list. Anything per-employee belongs in the single-record
 * path, where the rules can be reported against that employee's own row.
 */
export class BulkMarkAttendanceDto {
  @ApiProperty({
    example: '2026-08-05',
    description: 'The date to mark, for every employee in the list.',
  })
  @IsDateString()
  attendance_date!: string;

  @ApiProperty({
    example: 'Absent',
    enum: ATTENDANCE_STATUSES,
    description: 'Status applied to every employee in the list.',
  })
  @IsIn(ATTENDANCE_STATUSES, {
    message: `attendance_status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`,
  })
  attendance_status!: string;

  @ApiPropertyOptional({
    example: '09:00:00',
    description:
      'Check-in applied to every employee. Required by the service for ' +
      'Present, Late and Half-Day; rejected for Absent and On Leave.',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'check_in must be in HH:mm:ss format' })
  check_in?: string;

  @ApiPropertyOptional({
    example: '18:00:00',
    description: 'Check-out applied to every employee.',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'check_out must be in HH:mm:ss format' })
  check_out?: string;

  @ApiPropertyOptional({
    description:
      'Employees to mark. Omit — with all_active — to mark everyone who is ' +
      'currently active.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_EMPLOYEES, {
    message: `A bulk mark covers at most ${MAX_BULK_EMPLOYEES} employees per request.`,
  })
  @IsUUID('4', { each: true })
  user_ids?: string[];

  @ApiPropertyOptional({
    example: false,
    description:
      'Mark every active employee. Ignored when user_ids is supplied. ' +
      'Explicit rather than implied by an empty list, so an accidentally ' +
      'empty selection is an error instead of a company-wide write.',
  })
  @IsOptional()
  @IsBoolean()
  all_active?: boolean;

  @ApiPropertyOptional({
    description: 'Restrict all_active to one department.',
  })
  @IsOptional()
  @IsUUID('4')
  department_id?: string;

  @ApiPropertyOptional({
    example: 'Online',
    enum: ATTENDANCE_SOURCES,
    description:
      'Source applied to every row in this run: Device or Online. Defaults ' +
      'to Online when omitted.',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SOURCES, {
    message: `source must be one of: ${ATTENDANCE_SOURCES.join(', ')}`,
  })
  source?: string;
}

export { MAX_BULK_EMPLOYEES };
