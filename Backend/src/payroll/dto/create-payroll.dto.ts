import {
  IsDateString,
  IsNumber,
  IsUUID,
  Min,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class CreatePayrollDto {
  @ApiProperty({
    example: '2026-07-01',
  })
  @IsDateString()
  payroll_month!: Date;

  @ApiProperty({
    example: 100000,
  })
  @IsNumber()
  @Min(0)
  basic_salary!: number;

  @ApiProperty({
    example: 5000,
  })
  @IsNumber()
  @Min(0)
  allowance!: number;

  @ApiProperty({
    example: 10000,
  })
  @IsNumber()
  @Min(0)
  bonus!: number;

  @ApiProperty({
    example: 2500,
  })
  @IsNumber()
  @Min(0)
  deduction!: number;

  @ApiProperty({
    example: 5000,
  })
  @IsNumber()
  @Min(0)
  tax!: number;

  @ApiProperty({
    example: 107500,
  })
  @IsNumber()
  @Min(0)
  net_salary!: number;

  @ApiProperty({
    example: '2026-07-31',
  })
  @IsDateString()
  payment_date!: Date;

  @ApiProperty({
    example: 'employee-uuid',
  })
  @IsUUID()
  user_id!: string;
}