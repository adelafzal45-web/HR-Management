import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { NormalizeEmail } from '../../users/dto/validation.constants';

/**
 * Target for the "Send test email" button.
 *
 * The address is required rather than defaulting to the current admin: a test
 * whose destination is implicit makes it easy to conclude mail works when it
 * only works for one mailbox on the same domain as the sender.
 */
export class SendTestEmailDto {
  @ApiProperty({ example: 'admin@company.com' })
  @NormalizeEmail()
  @IsNotEmpty({ message: 'A destination address is required' })
  @IsEmail({}, { message: 'to must be a valid email address' })
  @MaxLength(255)
  to!: string;
}
