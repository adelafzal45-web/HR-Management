import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Describes who an entitlement action targets. Exactly one "selection" input
 * must be provided (single employee, multiple employees, department, or
 * designation) — validated in the service, since the mutually-exclusive
 * rule spans several optional fields and class-validator's cross-field
 * decorators would only make that harder to read.
 *
 * `exclude_user_ids` is applied last against whichever group was resolved,
 * so it works uniformly whether the base selection was a department, a
 * designation, or an explicit list.
 */
export class EntitlementTargetDto {
  @ApiPropertyOptional({ description: 'Single employee UUID.' })
  @IsOptional()
  @IsUUID('4')
  user_id?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Multiple employee UUIDs.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  user_ids?: string[];

  @ApiPropertyOptional({ description: 'All employees in this department.' })
  @IsOptional()
  @IsUUID('4')
  department_id?: string;

  @ApiPropertyOptional({ description: 'All employees holding this designation.' })
  @IsOptional()
  @IsUUID('4')
  designation_id?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Employee UUIDs to exclude from the resolved group.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  exclude_user_ids?: string[];
}
