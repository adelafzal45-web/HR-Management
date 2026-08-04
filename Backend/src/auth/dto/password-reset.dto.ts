import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  NormalizeEmail,
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
  Trim,
} from '../../users/dto/validation.constants';

/**
 * Step one of recovery: ask for a link.
 *
 * Carries only the address. Notably it does NOT accept a redirect or callback
 * URL — a caller-supplied destination is how a reset email becomes a phishing
 * vector, since the mail is genuinely from us and the link is not. The
 * destination is built server-side from configuration.
 */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'employee@hrms.local' })
  @NormalizeEmail()
  @IsNotEmpty()
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;
}

/**
 * Step two: redeem the token and set the new password.
 *
 * The token arrives in the body rather than the query string on purpose. Query
 * strings land in server access logs, browser history, and `Referer` headers on
 * any outbound request from the page — all places a live credential should not
 * be. (The validate endpoint does take it as a query param, because that one is
 * a read with no side effects and the UI needs it before rendering a form.)
 */
export class ResetPasswordWithTokenDto {
  @ApiProperty({ description: 'The opaque token from the emailed link.' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'The reset token is required' })
  @MaxLength(200)
  token!: string;

  @ApiProperty({ example: 'NewPassw0rd!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, { message: `Password ${PASSWORD_MESSAGE}` })
  new_password!: string;
}
