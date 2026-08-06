import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Body for `POST /designations/:id/reassign-and-delete`.
 *
 * Separate from the plain DELETE on purpose: reassigning the people who hold a
 * job title is a different act from removing a title nobody holds, and it
 * should not be reachable by bolting a query parameter onto a delete.
 */
export class ReassignAndDeleteDesignationDto {
  @ApiProperty({
    description:
      'Designation the employees are moved to before this one is deleted. ' +
      "Their department is realigned to the target designation's department " +
      'so the two cannot drift apart. Must not be the designation being deleted.',
    example: '9d09d20d-04dc-45f5-9255-f05c57fd62de',
  })
  @IsNotEmpty()
  @IsUUID()
  target_designation_id!: string;
}
