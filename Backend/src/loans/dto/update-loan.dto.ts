import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class UpdateLoanDto {
  @ApiPropertyOptional({
    example: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  installment_amount?: number;

  @ApiPropertyOptional({
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({
    example: 'Updated installment plan.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}