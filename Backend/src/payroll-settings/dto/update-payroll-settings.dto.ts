import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * PATCH body for the single global payroll settings row (id=1).
 *
 * Every field is optional — a client sends only what it is changing. The
 * constrained string fields use `@IsIn` against the same vocabularies the
 * calculation engine understands, so an unknown mode is rejected at the edge
 * rather than silently ignored deep in a run.
 */
export class UpdatePayrollSettingsDto {
  @ApiPropertyOptional({
    example: 'monthly',
    enum: ['monthly', 'weekly', 'biweekly'],
    description: 'How often payroll runs.',
  })
  @IsOptional()
  @IsIn(['monthly', 'weekly', 'biweekly'])
  frequency?: string;

  @ApiPropertyOptional({
    example: 'calendar',
    enum: ['calendar', 'custom'],
    description:
      'calendar = 1st–last of month; custom = period start/end set per run.',
  })
  @IsOptional()
  @IsIn(['calendar', 'custom'])
  period_type?: string;

  @ApiPropertyOptional({
    example: 'PKR',
    description: 'ISO 4217 currency code.',
  })
  @IsOptional()
  @IsIn(['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'])
  currency?: string;

  @ApiPropertyOptional({
    example: 'attendance',
    enum: ['calendar', 'fixed', 'attendance'],
    description: 'How WORKING_DAYS is derived for a period.',
  })
  @IsOptional()
  @IsIn(['calendar', 'fixed', 'attendance'])
  working_days_source?: string;

  @ApiPropertyOptional({
    example: 26,
    description: 'Used only when working_days_source = fixed. 1–31.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  fixed_working_days?: number;

  @ApiPropertyOptional({
    example: 8,
    description: 'Standard working hours per day (for per-hour rates). 1–24.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(24)
  working_hours_per_day?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'When true, a processed run must be approved by an Administrator before locking.',
  })
  @IsOptional()
  @IsBoolean()
  approval_enabled?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Generate a payslip per employee automatically on process.',
  })
  @IsOptional()
  @IsBoolean()
  auto_generate_payslip?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether employees can view their own payslips.',
  })
  @IsOptional()
  @IsBoolean()
  employee_self_service?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether a locked period is frozen against further edits.',
  })
  @IsOptional()
  @IsBoolean()
  payroll_locking_enabled?: boolean;

  @ApiPropertyOptional({
    example: 20,
    description: 'Day of month a payslip period is considered closed. 1–31.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  payslip_close_day?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'Master overtime switch. OFF by default — OT is only paid on non-working days and government holidays.',
  })
  @IsOptional()
  @IsBoolean()
  overtime_enabled?: boolean;

  @ApiPropertyOptional({
    example: 'nearest',
    enum: ['none', 'nearest', 'up', 'down'],
    description: 'Rounding applied to the net figure.',
  })
  @IsOptional()
  @IsIn(['none', 'nearest', 'up', 'down'])
  rounding?: string;
}
