import { IsString, IsDateString, IsOptional, MaxLength } from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePublicHolidayDto {
  /**
   * Public holiday name
   *
   * Example:
   * Eid-ul-Fitr
   * Independence Day
   */
  @ApiPropertyOptional({
    example: 'Independence Day',
    description: 'Updated name of the public holiday.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  /**
   * Updated holiday date
   *
   * Example:
   * 2026-08-14
   */
  @ApiPropertyOptional({
    example: '2026-08-14',
    description: 'Updated date of the public holiday.',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  holiday_date?: Date;

  /**
   * Updated description
   */
  @ApiPropertyOptional({
    example: 'Observed nationwide as a public holiday.',
    description: 'Updated description of the public holiday.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
