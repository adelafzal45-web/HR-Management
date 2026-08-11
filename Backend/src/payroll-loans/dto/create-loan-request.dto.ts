import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * An employee's own loan / salary-advance request (POST /payroll-loans/me).
 *
 * Deliberately narrower than CreateEmployeeLoanDto: there is no `user_id` (it
 * comes from the verified token, never the body) and no `status` (forced to
 * `pending`). The employee asks for an amount over a number of months; HR sets
 * the real `installment_amount` when approving, so it is not accepted here
 * either — `requested_months` is only a suggestion the approver sees.
 */
export class CreateLoanRequestDto {
  @ApiProperty({
    example: 'Salary advance — medical',
    description: 'What the advance is for.',
  })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 120000, description: 'Amount requested.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  principal!: number;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Preferred number of monthly installments. HR may adjust this when ' +
      'approving; used to suggest the installment amount.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  requested_months?: number;

  @ApiPropertyOptional({ description: 'Any context for the approver.' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
