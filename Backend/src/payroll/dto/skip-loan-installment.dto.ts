import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SkipLoanInstallmentDto {
  @ApiProperty({
    description: 'Payroll month for which the loan installment should be skipped',
    example: 8,
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  payrollMonth!: number;

  @ApiProperty({
    description: 'Payroll year for which the loan installment should be skipped',
    example: 2026,
  })
  @IsInt()
  @Min(2000)
  payrollYear!: number;

  @ApiPropertyOptional({
    description: 'Reason for skipping the loan installment',
    example: 'Approved salary adjustment',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}