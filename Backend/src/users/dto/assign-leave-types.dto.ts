import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, ValidateNested } from 'class-validator';

import { LeaveAssignmentDto } from './create-user.dto';

/**
 * Replaces an employee's whole set of allowed leave types.
 *
 * Deliberately a full replacement rather than an add/remove pair: the UI is a
 * checkbox list, so "the boxes that are ticked" is the natural payload, and a
 * diffing endpoint would need the client to compute the delta correctly to
 * avoid drift. An empty array is valid and means "no leave types allocated".
 *
 * Allocations for types already assigned are updated in place, so an
 * employee's `used_days` survives a re-save of the form — recreating the rows
 * would silently reset consumed balances to zero.
 */
export class AssignLeaveTypesDto {
  @ApiProperty({
    type: [LeaveAssignmentDto],
    description:
      'The complete set of leave types for this employee. Types omitted here are removed.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveAssignmentDto)
  @ArrayUnique((item: LeaveAssignmentDto) => item.leave_type_id, {
    message: 'The same leave type cannot be assigned twice',
  })
  assignments!: LeaveAssignmentDto[];
}
