import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { Trim } from '../../users/dto/validation.constants';

/**
 * PATCH body for the single Slack settings row.
 *
 * Every field is optional so the settings screen can send only what changed.
 * `token` is write-only by design — it is accepted here but never returned by
 * any read endpoint, which is why there is no matching field on
 * `SlackSettingsResponse` (only `token_set`).
 */
export class UpdateSlackSettingsDto {
  /**
   * Plaintext on the way in only. Encrypted with AES-256-GCM before it touches
   * the database (see `slack-crypto.ts`). Sending an empty string clears it.
   *
   * Deliberately NOT trimmed — mirrors the SMTP password so an explicit `""`
   * reaches the service and clears the stored token rather than being collapsed
   * to `undefined` (which would skip the field and leave the token in place).
   */
  @ApiPropertyOptional({
    example: 'xoxb-your-bot-token',
    description:
      'Write-only. Stored encrypted and never returned. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  token?: string;

  @ApiPropertyOptional({ example: '#general' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  default_channel?: string;

  /**
   * Master switch. `SlackSettingsService.validate()` reports Slack as not ready
   * while this is false, so turning it off is the supported way to stop outbound
   * messages without deleting the configuration.
   */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
