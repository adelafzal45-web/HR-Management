import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessPayrollDto {
  @ApiProperty({
    description: 'Payroll month to process',
    example: 8,
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  payrollMonth!: number;

  @ApiProperty({
    description: 'Payroll year to process',
    example: 2026,
  })
  @IsInt()
  @Min(2000)
  payrollYear!: number;

  @ApiPropertyOptional({
    description: 'Optional note regarding payroll processing',
    example: 'August 2026 payroll processed successfully',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}