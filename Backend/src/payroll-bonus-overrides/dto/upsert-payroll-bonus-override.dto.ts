import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Upsert a per-(employee, period) manual bonus for one payroll run.
 *
 * `amount` is the exact bonus for this employee this run and may be 0 — an
 * explicit 0 cancels the bonus (no bonus line), which is different from having
 * no override at all (the configured rule applies). One override per
 * (user_id, period_id): saving again replaces the previous one.
 */
export class UpsertPayrollBonusOverrideDto {
  @ApiProperty({ description: 'Employee receiving the manual bonus.' })
  @IsUUID()
  user_id!: string;

  @ApiProperty({ description: 'Payroll period this override applies to.' })
  @IsUUID()
  period_id!: string;

  @ApiProperty({
    example: 8000,
    description:
      'Exact bonus for this run. 0 cancels the bonus for this employee.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: 'Q3 spot award' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
