import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateLeaveRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  leave_type!: string;

  @IsDateString()
  start_date!: Date;

  @IsDateString()
  end_date!: Date;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsUUID()
  user_id!: string;

  @IsOptional()
  @IsUUID()
  approved_by_id?: string;
}
