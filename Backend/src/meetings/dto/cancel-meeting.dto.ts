import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * The reason is required rather than optional because participants read it in
 * the cancellation notice — the same rule the leave module applies to its
 * approval/rejection notes, and for the same reason: a bare "cancelled" with no
 * explanation generates follow-up questions for the organizer.
 */
export class CancelMeetingDto {
  @ApiProperty({
    example: 'Rescheduling to next week — key attendees are travelling.',
    description:
      'Why the meeting was cancelled. Shown to every participant in their ' +
      'notification and cancellation email.',
  })
  @IsString()
  @IsNotEmpty()
  cancellation_reason!: string;
}
