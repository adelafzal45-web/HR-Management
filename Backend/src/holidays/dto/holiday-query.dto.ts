import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { HolidayEventType } from '../holiday.entity';

export class HolidayQueryDto {
  @ApiPropertyOptional({
    enum: HolidayEventType,
    description: 'Filter to just holidays or just events. Omit for both.',
  })
  @IsOptional()
  @IsEnum(HolidayEventType)
  event_type?: HolidayEventType;

  @ApiPropertyOptional({ description: 'Filter by calendar year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    description:
      'Filter to holidays visible for this department (company-wide + this department\u2019s own).',
  })
  @IsOptional()
  @IsUUID('4', { message: 'department_id must be a valid UUID' })
  department_id?: string;
}
