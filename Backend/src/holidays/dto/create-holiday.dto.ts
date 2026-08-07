import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateHolidayDto {
  @ApiProperty({ example: 'New Year\u2019s Day' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  holiday_date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Restrict this holiday to one department. Omit for company-wide.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'department_id must be a valid UUID' })
  department_id?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'When true, recurs every year on the same month/day.',
  })
  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;
}
