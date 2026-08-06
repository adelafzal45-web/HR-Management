import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Body for `POST /departments/:id/reassign-and-delete`.
 *
 * Deliberately a separate DTO rather than an optional field on the DELETE
 * route: moving 40 employees between departments is a different act from
 * deleting an empty one, and it should not be reachable by adding a query
 * parameter to a call the caller thought was a plain delete.
 */
export class ReassignAndDeleteDepartmentDto {
  @ApiProperty({
    description:
      'Department that the employees and designations are moved to before ' +
      'this one is deleted. Must not be the department being deleted.',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @IsNotEmpty()
  @IsUUID()
  target_department_id!: string;
}
