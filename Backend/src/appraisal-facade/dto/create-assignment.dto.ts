import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Assigns a form to exactly one audience: a department, a designation, or a
 * single employee. The service rejects payloads that set zero or more than one
 * target (the DB has a matching CHECK constraint as a backstop).
 */
export class CreateAssignmentDto {
  @ApiPropertyOptional({
    description: 'Assign to every employee in this department',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Assign to every employee with this designation',
  })
  @IsOptional()
  @IsUUID()
  designationId?: string;

  @ApiPropertyOptional({ description: 'Assign to a single employee' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
