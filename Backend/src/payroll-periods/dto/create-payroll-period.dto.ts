import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Pay frequencies a period can run on — mirrors PayrollSettings.frequency. */
export const PERIOD_FREQUENCIES = ['monthly', 'weekly', 'biweekly'] as const;

/**
 * Create a payroll period (spec §1). Status is not accepted here — a period is
 * always born `draft` and advances only through the process/approve/lock
 * endpoints, never by a direct write.
 */
export class CreatePayrollPeriodDto {
  @ApiProperty({ example: 'August 2026', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ enum: PERIOD_FREQUENCIES, default: 'monthly' })
  @IsOptional()
  @IsIn(PERIOD_FREQUENCIES)
  frequency?: string;

  @ApiProperty({ example: '2026-08-01', description: 'ISO date (YYYY-MM-DD).' })
  @IsDateString()
  period_start!: string;

  @ApiProperty({ example: '2026-08-31', description: 'ISO date (YYYY-MM-DD).' })
  @IsDateString()
  period_end!: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'ISO date.' })
  @IsOptional()
  @IsDateString()
  pay_date?: string;

  @ApiPropertyOptional({
    example: 26,
    description:
      'Working days for the run. Left unset, the engine derives it per employee (weekdays minus holidays) or from settings.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  working_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
