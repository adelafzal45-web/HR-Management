import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  CALCULATION_TYPES,
  COMPONENT_TYPES,
} from '../../payroll-engine/payroll.constants';

/**
 * Create a salary component (spec §2, the atom of the payroll engine).
 *
 * The formula field is only meaningful when `calculation_type = 'formula'`; the
 * service validates it against the safe evaluator's whitelist and rejects an
 * empty formula for a formula-typed component. `amount` carries the flat figure,
 * percentage, or per-unit rate for the other calculation types.
 */
export class CreateSalaryComponentDto {
  @ApiProperty({
    example: 'House Rent Allowance',
    description: 'Display name.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: 'HRA',
    description:
      'Stable machine code (unique). Uppercase letters, digits and underscore.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message:
      'code must be UPPER_SNAKE (start with a letter; letters, digits, underscore).',
  })
  code!: string;

  @ApiProperty({ example: 'earning', enum: COMPONENT_TYPES })
  @IsIn(COMPONENT_TYPES)
  type!: string;

  @ApiProperty({ example: 'percent_basic', enum: CALCULATION_TYPES })
  @IsIn(CALCULATION_TYPES)
  calculation_type!: string;

  @ApiPropertyOptional({
    example: 40,
    description:
      'Flat amount for fixed, percentage for percent_*, per-unit rate for per_day/per_hour. Ignored for formula.',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    example: 'BASIC * 0.4',
    description:
      'Formula over approved variables. Required when calculation_type = formula.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  formula?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  is_taxable?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  include_in_gross?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  include_in_overtime?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  include_in_leave_deduction?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  include_in_bonus?: boolean;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Component takes effect from this date (inclusive).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_from must be an ISO date (YYYY-MM-DD).',
  })
  effective_from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Component stops applying after this date (inclusive).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_to must be an ISO date (YYYY-MM-DD).',
  })
  effective_to?: string;
}
