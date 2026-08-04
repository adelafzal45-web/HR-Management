import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttendanceDto {
  @ApiProperty({
    example: '2026-07-22',
    description: 'Attendance date',
  })
  @IsDateString()
  attendance_date!: Date;

  @ApiProperty({
    example: '09:00:00',
    description: 'Employee check-in time (HH:mm:ss)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, {
    message: 'check_in must be in HH:mm:ss format',
  })
  check_in!: string;

  @ApiPropertyOptional({
    example: '18:00:00',
    description: 'Employee check-out time (HH:mm:ss)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, {
    message: 'check_out must be in HH:mm:ss format',
  })
  check_out?: string;

  @ApiPropertyOptional({
    example: 8,
    description: 'Total working hours',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  working_hours?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Overtime hours worked',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  overtime_hours?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the employee worked overtime',
  })
  @IsOptional()
  @IsBoolean()
  is_overtime?: boolean;

  @ApiProperty({
    example: 'Present',
    description: 'Attendance status',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  attendance_status!: string;
}