import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLoanDto {
  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'Employee UUID.',
  })
  @IsUUID()
  user_id!: string;

  @ApiProperty({
    example: 120000,
    description: 'Total loan amount.',
  })
  @IsNumber()
  @Min(0.01)
  principal_amount!: number;

  @ApiProperty({
    example: 10000,
    description: 'Monthly installment amount.',
  })
  @IsNumber()
  @Min(0.01)
  installment_amount!: number;

  @ApiProperty({
    example: 12,
    description: 'Number of installments.',
  })
  @IsInt()
  @Min(1)
  total_installments!: number;

  @ApiProperty({
    example: '2026-08-01',
  })
  @IsDateString()
  start_date!: string;

  @ApiPropertyOptional({
    example: 'Personal emergency loan.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}