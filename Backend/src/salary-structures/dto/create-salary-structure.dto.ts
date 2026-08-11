import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CALCULATION_TYPES } from '../../payroll-engine/payroll.constants';

/**
 * One component's membership in a structure, with optional per-structure
 * overrides. The overrides let the same component behave differently inside
 * different structures without cloning it (spec §3).
 */
export class StructureComponentDto {
  @ApiProperty({
    example: '2f1a…',
    description: 'The salary component to include.',
  })
  @IsUUID()
  component_id!: string;

  @ApiPropertyOptional({
    enum: CALCULATION_TYPES,
    description: 'Overrides the component calculation type for this structure.',
  })
  @IsOptional()
  @IsIn(CALCULATION_TYPES)
  override_calculation_type?: string;

  @ApiPropertyOptional({
    example: 50,
    description:
      'Overrides the component amount/percentage for this structure.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  override_amount?: number;

  @ApiPropertyOptional({
    example: 'BASIC * 0.5',
    description: 'Overrides the component formula for this structure.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  override_formula?: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  display_order?: number;
}

export class CreateSalaryStructureDto {
  @ApiProperty({ example: 'Standard Staff', description: 'Unique name.' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Default package for full-time staff.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({
    type: [StructureComponentDto],
    description: 'Components to seed the structure with (optional).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StructureComponentDto)
  components?: StructureComponentDto[];
}
