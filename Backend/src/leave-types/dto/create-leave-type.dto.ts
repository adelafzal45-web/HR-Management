import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLeaveTypeDto {
  @ApiProperty({
    example: 'Annual Leave',
    description: 'Unique name of the leave type',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: 'Paid annual vacation entitlement',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: true,
    description: 'Whether leave of this type is paid',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_paid?: boolean;

  @ApiProperty({
    example: 20,
    description: 'Maximum days an employee may take per year (0 = unlimited)',
    required: false,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_days_per_year?: number;

  @ApiProperty({
    example: true,
    description: 'Whether unused days may be carried into the next year',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  carry_forward_allowed?: boolean;

  @ApiProperty({
    example: 5,
    description:
      'Maximum days carried forward. Must be 0 when carry_forward_allowed is false.',
    required: false,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_carry_forward_days?: number;

  @ApiProperty({
    example: true,
    description: 'Inactive types stay on record but cannot be requested',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
