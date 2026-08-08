import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MeetingAudienceType } from '../meetings.entity';

export class CreateMeetingDto {
  @ApiProperty({
    example: 'Q3 Engineering Planning',
    description: 'Meeting title.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    example: '2026-09-02T14:30:00.000Z',
    description:
      'When the meeting starts, as an ISO 8601 instant. Must be in the future.',
  })
  @IsDateString()
  scheduled_at!: string;

  @ApiPropertyOptional({
    example: 'Meeting Room 2 / https://meet.example.com/q3-planning',
    description: 'Physical room or a joining URL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({
    example: '1. Roadmap review\n2. Hiring plan\n3. Open floor',
    description: 'Free-text agenda shown in the invitation.',
  })
  @IsOptional()
  @IsString()
  agenda?: string;

  @ApiProperty({
    enum: MeetingAudienceType,
    default: MeetingAudienceType.SPECIFIC,
    description:
      'How the invitee list is chosen. Specific = the participant_ids below; ' +
      'Department = every active member of audience_department_id; ' +
      'All = every active employee. The organizer is always included.',
  })
  @IsEnum(MeetingAudienceType)
  audience_type!: MeetingAudienceType;

  @ApiPropertyOptional({
    example: '9c8f2a1e-4b7d-4f2a-8e11-6d3c5b9a2f70',
    description: 'Department UUID. Required when audience_type is Department.',
  })
  @ValidateIf(
    (dto: CreateMeetingDto) =>
      dto.audience_type === MeetingAudienceType.DEPARTMENT,
  )
  @IsUUID()
  audience_department_id?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Invitee user UUIDs. Required when audience_type is Specific; ignored ' +
      'for Department and All, which resolve their own lists server-side.',
  })
  @ValidateIf(
    (dto: CreateMeetingDto) =>
      dto.audience_type === MeetingAudienceType.SPECIFIC,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  participant_ids?: string[];

  @ApiPropertyOptional({
    default: true,
    description: 'Send the invitation by email.',
  })
  @IsOptional()
  @IsBoolean()
  notify_email?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Raise an in-app notification for each participant.',
  })
  @IsOptional()
  @IsBoolean()
  notify_in_app?: boolean;
}
