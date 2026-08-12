import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { HolidayEventType } from '../holiday.entity';

export class CreateHolidayDto {
  @ApiProperty({ example: 'New Year\u2019s Day' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({
    enum: HolidayEventType,
    default: HolidayEventType.HOLIDAY,
    description:
      'Holiday = excluded from leave/attendance day counts. Event = calendar-only (e.g. a dinner, town hall) and never affects working-day counts.',
  })
  @IsOptional()
  @IsEnum(HolidayEventType)
  event_type?: HolidayEventType;

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

  @ApiPropertyOptional({
    default: false,
    description:
      'When true, sends an in-app notification to every active employee announcing this holiday/event.',
  })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
