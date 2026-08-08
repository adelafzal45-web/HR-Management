import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CreateLeaveRequestDto } from './create-leave-request.dto';

/**
 * Everything on create is optional here, plus the three decision notes.
 *
 * The service — not the DTO — enforces that a note is present for the status
 * being set: which field is mandatory depends on the target status, and
 * class-validator cannot express "required only when status === 'Approved'"
 * without a custom constraint that would still have to duplicate the
 * service's status normalisation.
 */
export class UpdateLeaveRequestDto extends PartialType(CreateLeaveRequestDto) {
  @ApiPropertyOptional({
    example: 'Cover arranged with the rest of the team.',
    description:
      'Approver note. Required when setting status to Approved. Included in ' +
      'the approval notification sent to the employee.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  approval_reason?: string;

  @ApiPropertyOptional({
    example: 'Two people are already off that week.',
    description:
      'Rejection note. Required when setting status to Rejected. Included in ' +
      'the rejection notification sent to the employee.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejection_reason?: string;

  @ApiPropertyOptional({
    example: 'Trip postponed.',
    description:
      'Cancellation note. Required when setting status to Cancelled. Any days ' +
      'already deducted are returned to the balance.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellation_reason?: string;
}
