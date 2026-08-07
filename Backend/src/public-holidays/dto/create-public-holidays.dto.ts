import {
  IsString,
  IsDateString,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePublicHolidayDto {
  /**
   * Public holiday name
   *
   * Example:
   * Eid-ul-Fitr
   * Independence Day
   * Christmas
   */
  @ApiProperty({
    example: 'Independence Day',
    description: 'Name of the public holiday.',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name!: string;

  /**
   * Date of holiday
   *
   * Example:
   * 2026-08-14
   */
  @ApiProperty({
    example: '2026-08-14',
    description: 'Date on which the public holiday occurs.',
    type: String,
    format: 'date',
  })
  @IsDateString()
  holiday_date!: Date;

  /**
   * Additional details about holiday
   */
  @ApiPropertyOptional({
    example: 'National holiday celebrated across the country.',
    description: 'Optional description of the public holiday.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * HR/Admin user who created this holiday
   */
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID of the HR/Admin creating the public holiday.',
  })
  @IsUUID()
  created_by_id!: string;
}
