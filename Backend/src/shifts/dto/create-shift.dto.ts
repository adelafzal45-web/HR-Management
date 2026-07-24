import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Matches,
  MaxLength,
  IsOptional,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateShiftDto {
  @ApiProperty({
    example: 'Morning Shift',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shift_name!: string;

  @ApiProperty({
    example: '09:00:00',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
  start_time!: string;

  @ApiProperty({
    example: '18:00:00',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
  end_time!: string;

  @ApiProperty({
    example: 15,
  })
  @IsNumber()
  @Min(0)
  grace_period_minutes!: number;

  @ApiProperty({
    example: 'Active',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}