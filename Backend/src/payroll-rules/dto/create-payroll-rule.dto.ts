import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RULE_TYPES } from '../payroll-rule.constants';
import { SCOPE_TYPES } from '../../payroll-engine/payroll.constants';

/**
 * Create a payroll rule (spec §4–8).
 *
 * `config` is validated by the service against the shape for `rule_type` — a
 * bad config (missing multiplier, unknown formula variable, …) is a 400. The
 * scope pair mirrors salary-structure assignments: `company` scope carries a
 * null `scope_id`; every other scope needs one.
 */
export class CreatePayrollRuleDto {
  @ApiProperty({ example: 'late', enum: RULE_TYPES })
  @IsIn(RULE_TYPES)
  rule_type!: string;

  @ApiProperty({ example: 'Standard late penalty' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: 'company',
    enum: SCOPE_TYPES,
    default: 'company',
  })
  @IsOptional()
  @IsIn(SCOPE_TYPES)
  scope_type?: string;

  @ApiPropertyOptional({
    description: 'Target id for non-company scopes; omit for company scope.',
  })
  @IsOptional()
  @IsString()
  scope_id?: string | null;

  @ApiProperty({
    description:
      'Type-specific settings. Shape depends on rule_type; validated server-side.',
    example: { grace_minutes: 10, unit: 'per_minute', amount: 20 },
  })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Rule takes effect from this date (inclusive).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_from must be an ISO date (YYYY-MM-DD).',
  })
  effective_from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Rule stops applying after this date (inclusive).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_to must be an ISO date (YYYY-MM-DD).',
  })
  effective_to?: string;
}
