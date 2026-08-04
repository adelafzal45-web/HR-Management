import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { Trim, TrimOptional } from '../../users/dto/validation.constants';
import type { SmtpEncryption } from '../entities/smtp-settings.entity';

export const SMTP_ENCRYPTIONS = ['none', 'tls', 'ssl'] as const;

/**
 * PATCH body for the single SMTP settings row.
 *
 * Every field is optional so the settings screen can send only what changed.
 * `password` is write-only by design — it is accepted here but never returned
 * by any read endpoint, which is why there is no matching field on
 * `SmtpSettingsResponse`.
 */
export class UpdateSmtpSettingsDto {
  @ApiPropertyOptional({ example: 'smtp.gmail.com' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  host?: string;

  @ApiPropertyOptional({ example: 587, minimum: 1, maximum: 65535 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ example: 'no-reply@company.com' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  username?: string;

  /**
   * Plaintext on the way in only. Encrypted with AES-256-GCM before it touches
   * the database (see `smtp-crypto.ts`). Sending an empty string clears it.
   */
  @ApiPropertyOptional({
    example: 'app-specific-password',
    description:
      'Write-only. Stored encrypted and never returned. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  password?: string;

  @ApiPropertyOptional({ enum: SMTP_ENCRYPTIONS, example: 'tls' })
  @IsOptional()
  @IsIn(SMTP_ENCRYPTIONS, {
    message: `encryption must be one of: ${SMTP_ENCRYPTIONS.join(', ')}`,
  })
  encryption?: SmtpEncryption;

  @ApiPropertyOptional({ example: 'TechnoCues HR' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(150)
  from_name?: string;

  @ApiPropertyOptional({ example: 'hr@company.com' })
  @IsOptional()
  @TrimOptional()
  @IsEmail({}, { message: 'from_email must be a valid email address' })
  @MaxLength(255)
  from_email?: string;

  @ApiPropertyOptional({ example: 'support@company.com' })
  @IsOptional()
  @TrimOptional()
  @IsEmail({}, { message: 'reply_to must be a valid email address' })
  @MaxLength(255)
  reply_to?: string;

  /**
   * Master switch. The queue processor refuses to send while this is false, so
   * turning it off is the supported way to stop outbound mail without deleting
   * the configuration.
   */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
