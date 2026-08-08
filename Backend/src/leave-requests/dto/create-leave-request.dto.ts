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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LeaveDurationType } from '../leave-requests.entity';

export class CreateLeaveRequestDto {
  @ApiProperty({
    example: 'Annual Leave',
    description: 'Type of leave requested.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  leave_type!: string;

  @ApiProperty({
    example: '2026-08-15',
    description: 'Leave start date.',
  })
  @IsDateString()
  start_date!: Date;

  @ApiProperty({
    example: '2026-08-18',
    description: 'Leave end date.',
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
    default: LeaveDurationType.FULL_DAY,
    enum: LeaveDurationType,
    description:
      'How much of the day(s) the request covers. Full Day / First Half / ' +
      'Second Half are single-day (half-days charge 0.5); Multiple Days spans ' +
      'start_date to end_date and only working days count. ' +
      'is_half_day is derived from this.',
  })
  @IsOptional()
  @IsEnum(LeaveDurationType)
  duration_type?: LeaveDurationType;

  @ApiPropertyOptional({
    description:
      'Leave type catalog UUID. Required for balance deduction — a request without it cannot be matched to an entitlement/balance.',
  })
  @IsOptional()
  @IsUUID()
  leave_type_id?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Single-day request charged as half a day (deducts 0.5 instead of 1). ' +
      'Kept for backward compatibility — new clients should send duration_type.',
  })
  @IsOptional()
  @IsBoolean()
  is_half_day?: boolean;

  @ApiPropertyOptional({
    description:
      'Server-side path of an uploaded supporting document, as returned by ' +
      'the leave attachment upload endpoint.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_path?: string;

  @ApiPropertyOptional({
    description: 'Original filename of the attachment, for downloads.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_name?: string;

  @ApiPropertyOptional({
    example: 'Pending',
    description: 'Current status of the leave request.',
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

  @ApiPropertyOptional({
    example: '0ab49780-8dc6-4c3b-9eb0-a7c3f8365c12',
    description: 'UUID of the manager approving the request.',
  })
  @IsOptional()
  @IsUUID()
  approved_by_id?: string;
}