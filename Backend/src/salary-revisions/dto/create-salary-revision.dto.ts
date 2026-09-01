import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CHANGE_TYPES = ['increment', 'decrement'] as const;
export const INPUT_MODES = ['amount', 'percent'] as const;

/**
 * Apply a base-salary increment or decrement (Feature: salary revisions).
 *
 * `input_value` is always a positive magnitude — the direction comes from
 * `change_type`, so the client never sends a negative number. When `input_mode`
 * is `percent` it is a percentage of the current salary; when `amount` it is a
 * currency figure. The service computes the resulting `new_salary`, rejects a
 * result below zero, and records the previous/new/delta itself.
 */
export class CreateSalaryRevisionDto {
  @ApiProperty({ description: 'Employee whose base salary changes.' })
  @IsString()
  user_id!: string;

  @ApiProperty({ example: 'increment', enum: CHANGE_TYPES })
  @IsIn(CHANGE_TYPES)
  change_type!: string;

  @ApiProperty({ example: 'amount', enum: INPUT_MODES })
  @IsIn(INPUT_MODES)
  input_mode!: string;

  @ApiProperty({
    example: 5000,
    description:
      'Positive magnitude of the change — a currency amount, or a percentage when input_mode is "percent".',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  input_value!: number;

  @ApiPropertyOptional({ example: 'Annual merit increase' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    example: '2026-08-18',
    description:
      'Date the change takes effect (inclusive). Defaults to today; may be backdated but not future-dated.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_date must be an ISO date (YYYY-MM-DD).',
  })
  effective_date?: string;
}
