import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsEnum,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LeaveDurationType {
  FIRST_HALF = 'FIRST_HALF',
  SECOND_HALF = 'SECOND_HALF',
  FULL_DAY = 'FULL_DAY',
  MULTIPLE_DAYS = 'MULTIPLE_DAYS',
}

export class CreateLeaveRequestDto {
  @ApiProperty({
    example: 'Annual Leave',
    description: 'Type of leave requested.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  leave_type!: string;

  @ApiPropertyOptional({
    enum: LeaveDurationType,
    example: LeaveDurationType.FULL_DAY,
    description: 'Leave duration type. Defaults to FULL_DAY if not provided.',
  })
  @IsOptional()
  @IsEnum(LeaveDurationType)
  duration_type?: LeaveDurationType;

  @ApiProperty({
    example: '2026-08-15',
    description: 'Leave start date.',
  })
  @IsDateString()
  start_date!: Date;

  @ApiProperty({
    example: '2026-08-18',
    description:
      'Leave end date. For FIRST_HALF, SECOND_HALF and FULL_DAY this should be the same as start_date.',
  })
  @IsDateString()
  end_date!: Date;

  @ApiPropertyOptional({
    example: 'Family vacation',
    description: 'Reason for requesting leave.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    example: 'Pending',
    description: 'Leave status. Defaults to Pending.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiProperty({
    example: 'db82907b-f347-4bb3-9d2e-f08d8ec2d5c5',
    description: 'UUID of the employee requesting leave.',
  })
  @IsUUID()
  user_id!: string;
}
