import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * HR/Admin's approval of an employee loan request
 * (POST /payroll-loans/:id/approve).
 *
 * The employee asked for an amount and a preferred term; the approver sets the
 * installment that payroll will actually deduct. Omitting `installment_amount`
 * keeps whatever the request derived from `requested_months`. Approval flips the
 * loan to `active` and generates the installment schedule.
 */
export class ApproveLoanRequestDto {
  @ApiPropertyOptional({
    example: 10000,
    description:
      'Amount deducted each period. Omit to keep the requested installment.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  installment_amount?: number;

  @ApiPropertyOptional({
    description: 'Payroll period repayment starts from (omit = starts anytime).',
  })
  @IsOptional()
  @IsUUID()
  start_period_id?: string;

  @ApiPropertyOptional({
    description: 'Note shown to the employee alongside the decision.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Rejection carries only the explanation. */
export class RejectLoanRequestDto {
  @ApiPropertyOptional({
    description: 'Note shown to the employee explaining the rejection.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
