import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PayrollAdjustmentType } from '../enums/payroll-adjustment-type.enum';

export class UpdatePayrollAdjustmentDto {
  @ApiPropertyOptional({
    description: 'Type of payroll adjustment',
    enum: PayrollAdjustmentType,
    example: PayrollAdjustmentType.BONUS,
  })
  @IsOptional()
  @IsEnum(PayrollAdjustmentType)
  type?: PayrollAdjustmentType;

  @ApiPropertyOptional({
    description: 'Adjustment amount',
    example: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Description of the adjustment',
    example: 'Performance bonus',
  })
  @IsOptional()
  @IsString()
  description?: string;
}