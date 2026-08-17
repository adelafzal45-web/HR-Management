import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

import { ATTENDANCE_STATUSES } from '../attendance-status';

/**
 * Server-side filters for the org-wide attendance list (`GET /attendance`).
 *
 * All three are optional, so an unfiltered call still returns everything and the
 * existing screen keeps working. When supplied, `from`/`to` bound
 * `attendance_date` (inclusive) and `status` matches `attendance_status`
 * exactly. Pagination, department/employee narrowing, search and CSV export stay
 * client-side, so those keep working unchanged on top of the filtered set.
 */
export class AttendanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Only records on or after this date (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'from must be a valid date in YYYY-MM-DD format.' },
  )
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description: 'Only records on or before this date (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsDateString({}, { message: 'to must be a valid date in YYYY-MM-DD format.' })
  to?: string;

  @ApiPropertyOptional({
    example: 'Present',
    enum: ATTENDANCE_STATUSES,
    description: 'Only records with this exact status.',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_STATUSES, {
    message: `status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`,
  })
  status?: string;
}
