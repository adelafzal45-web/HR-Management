import {
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SCOPE_TYPES } from '../../payroll-engine/payroll.constants';

/**
 * Assign a structure to a scope with an effective window (spec §12/§13).
 *
 * `scope_id` is required for every scope except 'company' (which is org-wide and
 * carries a null id); the service enforces that pairing. `base_salary`, when
 * set, establishes BASIC for the matched employees.
 */
export class CreateStructureAssignmentDto {
  @ApiProperty({ description: 'Structure to assign.' })
  @IsUUID()
  structure_id!: string;

  @ApiProperty({ enum: SCOPE_TYPES, example: 'department' })
  @IsIn(SCOPE_TYPES)
  scope_type!: string;

  @ApiPropertyOptional({
    description:
      'Target entity id — department/designation/job-category/employee. Omit for company scope.',
  })
  // Required and must be a UUID unless the scope is company.
  @ValidateIf((o: CreateStructureAssignmentDto) => o.scope_type !== 'company')
  @IsUUID()
  scope_id?: string;

  @ApiPropertyOptional({
    example: 100000,
    description:
      'Sets BASIC for matched employees. Falls back to users.salary.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  base_salary?: number;

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

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  is_active?: boolean;
}
