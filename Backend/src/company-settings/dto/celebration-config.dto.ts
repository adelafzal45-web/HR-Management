import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Validates the celebration announcement config for the company-settings PATCH.
 *
 * Stored as one jsonb blob and replaced wholesale — the frontend sends the whole
 * object, so every field is required (a partial config has no meaning against a
 * null column that already stands in for "use defaults"). `send_time` is 'HH:MM'
 * 24-hour; `heading` is length-capped so the bell/Slack post stays reasonable.
 */
export class CelebrationConfigDto {
  @ApiProperty({
    example: true,
    description: 'Master switch for the daily automatic announcement.',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    example: '08:00',
    description: 'Send time, HH:MM 24-hour, server-local.',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'send_time must be HH:MM 24-hour (e.g. 08:00)',
  })
  send_time!: string;

  @ApiProperty({
    example: "🎉 Today's Celebrations",
    description: 'Announcement title and first line of the broadcast/Slack summary.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  heading!: string;
}
