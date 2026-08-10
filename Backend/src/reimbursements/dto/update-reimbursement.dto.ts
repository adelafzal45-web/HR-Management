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

export class UpdateReimbursementDto {
  @ApiPropertyOptional({
    example: 5500,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    example: 'Updated travel expense.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '2026-08-20',
  })
  @IsOptional()
  @IsDateString()
  expense_date?: string;

  @ApiPropertyOptional({
    example: 'TRAVEL',
  })
  @IsOptional()
  @IsString()
  reimbursement_type?: string;
}