import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateMeetingDto } from './create-meeting.dto';
import { MeetingStatus } from '../meetings.entity';

/**
 * Every create field is optional here, plus `status` so a meeting can be marked
 * Completed. Cancelling is deliberately *not* done through this DTO — it goes
 * through `CancelMeetingDto` on its own endpoint, so the reason can be required
 * without making it required for every other kind of edit.
 */
export class UpdateMeetingDto extends PartialType(CreateMeetingDto) {
  @ApiPropertyOptional({
    enum: MeetingStatus,
    description:
      'Lifecycle state. Use PATCH /meetings/:id/cancel to cancel — that path ' +
      'requires a cancellation reason.',
  })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;
}
