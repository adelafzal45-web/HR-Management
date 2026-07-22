import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

export class CreateAttendanceDto {
  @IsDateString()
  attendance_date!: Date;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, {
    message: 'check_in must be in HH:mm:ss format',
  })
  check_in!: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, {
    message: 'check_out must be in HH:mm:ss format',
  })
  check_out?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  working_hours?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  attendance_status!: string;

  @IsUUID()
  user_id!: string;
}
