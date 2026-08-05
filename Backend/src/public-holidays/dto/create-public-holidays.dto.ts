import {
  IsString,
  IsDateString,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePublicHolidayDto {
  /**
   * Public holiday name
   *
   * Example:
   * Eid-ul-Fitr
   * Independence Day
   * Christmas
   */
  @IsString()
  @MaxLength(100)
  name!: string;

  /**
   * Date of holiday
   *
   * Example:
   * 2026-08-14
   */
  @IsDateString()
  holiday_date!: Date;

  /**
   * Additional details about holiday
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * HR/Admin user who created this holiday
   */
  @IsUUID()
  created_by_id!: string;
}
