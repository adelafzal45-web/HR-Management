import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { TrimOptional } from '../../users/dto/validation.constants';

/**
 * Body for the "Send test message" button.
 *
 * The channel is optional: left blank, the test posts to the configured default
 * channel. Supplied, it overrides for this one message so an admin can confirm
 * the bot can reach a specific channel without changing the saved default.
 */
export class SendTestSlackMessageDto {
  @ApiPropertyOptional({
    example: '#general',
    description:
      'Optional channel override. Defaults to the configured default channel.',
  })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(255)
  channel?: string;
}
