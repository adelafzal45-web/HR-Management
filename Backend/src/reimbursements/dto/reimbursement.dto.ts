import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  REIMBURSEMENT_CATEGORIES,
  REIMBURSEMENT_STATUSES,
} from '../reimbursement.entity';

export class CreateReimbursementDto {
  @ApiProperty({ example: 'Client dinner', description: 'What was paid for.' })
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiProperty({ enum: REIMBURSEMENT_CATEGORIES, default: 'Other' })
  @IsIn(REIMBURSEMENT_CATEGORIES)
  category!: string;

  @ApiProperty({ example: 4500, description: 'Amount claimed back.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ description: 'Date the expense was incurred (ISO 8601).' })
  @IsDateString()
  expense_date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Link to a receipt (v1: stored, not uploaded).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receipt_url?: string;
}

/** HR filing a claim on an employee's behalf adds the employee. */
export class CreateClaimForEmployeeDto extends CreateReimbursementDto {
  @ApiProperty({ description: 'Employee the claim belongs to.' })
  @IsString()
  user_id!: string;
}

export class UpdateReimbursementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ enum: REIMBURSEMENT_CATEGORIES })
  @IsOptional()
  @IsIn(REIMBURSEMENT_CATEGORIES)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expense_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receipt_url?: string;
}

export class DecideReimbursementDto {
  @ApiPropertyOptional({
    description: 'Note shown to the employee alongside the decision.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReimbursementFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by employee.' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: REIMBURSEMENT_STATUSES })
  @IsOptional()
  @IsIn(REIMBURSEMENT_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'ISO date; only expenses on/after it.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date; only expenses on/before it.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
