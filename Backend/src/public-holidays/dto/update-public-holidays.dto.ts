import { IsString, IsDateString, IsOptional, MaxLength } from 'class-validator';

export class UpdatePublicHolidayDto {
  /**
   * Public holiday name
   *
   * Example:
   * Eid-ul-Fitr
   * Independence Day
   */
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
  @IsOptional()
  @IsDateString()
  holiday_date?: Date;

  /**
   * Updated description
   */
  @IsOptional()
  @IsString()
  description?: string;
}
