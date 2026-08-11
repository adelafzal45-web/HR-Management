import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CALCULATION_TYPES } from '../../payroll-engine/payroll.constants';

/**
 * A per-employee override of a single component (spec §12, narrowest scope).
 *
 * Lets HR bump one person's Transport allowance without touching their
 * structure. At least one of the override fields should be set — an override
 * with none is a no-op the service rejects.
 */
export class CreateEmployeeOverrideDto {
  @ApiProperty({ description: 'Employee whose component is overridden.' })
  @IsUUID()
  user_id!: string;

  @ApiProperty({ description: 'Component being overridden.' })
  @IsUUID()
  component_id!: string;

  @ApiPropertyOptional({ enum: CALCULATION_TYPES })
  @IsOptional()
  @IsIn(CALCULATION_TYPES)
  override_calculation_type?: string;

  @ApiPropertyOptional({ example: 15000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  override_amount?: number;

  @ApiPropertyOptional({ example: 'BASIC * 0.05' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  override_formula?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_from must be an ISO date (YYYY-MM-DD).',
  })
  effective_from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_to must be an ISO date (YYYY-MM-DD).',
  })
  effective_to?: string;
}
