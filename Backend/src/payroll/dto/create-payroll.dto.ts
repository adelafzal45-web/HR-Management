import {
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayrollDto {
  @ApiProperty({
    description: 'ID of the employee for whom payroll is being created',
    example: 15,
  })
  @IsInt()
  employeeId!: number;

  @ApiProperty({
    description: 'Payroll month',
    example: 8,
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  payrollMonth!: number;

  @ApiProperty({
    description: 'Payroll year',
    example: 2026,
  })
  @IsInt()
  @Min(2000)
  payrollYear!: number;

  @ApiProperty({
    description: 'Basic salary of the employee',
    example: 100000,
  })
  @IsNumber()
  @Min(0)
  basicSalary!: number;

  @ApiPropertyOptional({
    description: 'Additional allowance amount',
    example: 15000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAllowances?: number;

  @ApiPropertyOptional({
    description: 'Additional deduction amount',
    example: 5000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalDeductions?: number;
}