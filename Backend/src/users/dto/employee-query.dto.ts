import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EMPLOYMENT_TYPES } from './validation.constants';

/**
 * Whitelist of columns the client may sort by.
 *
 * This is a whitelist rather than a free-form string because `sortBy` is
 * interpolated into an ORDER BY clause — TypeORM does not parameterise
 * identifiers, so an unvalidated value there is a SQL injection vector.
 * Keys are the API-facing names; the service maps them to qualified columns.
 */
export const EMPLOYEE_SORT_FIELDS = [
  'employee_code',
  'first_name',
  'last_name',
  'email',
  'joining_date',
  'created_at',
  'status',
  'salary',
] as const;

export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

/** Parses `?status=true` / `?status=false` from a query string into a boolean. */
const BooleanQuery = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return value; // let @IsBoolean report it
  });

/**
 * Query params for the paginated employee list.
 *
 * `search` and pagination/sorting are inherited from PaginationQueryDto so the
 * envelope stays identical to every other list endpoint in the app.
 */
export class EmployeeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Narrow the list to a single user. Lets the Team Leads tab filter to one ' +
      'lead without the client having to page through and filter in memory, ' +
      'which would break the pagination envelope.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'user_id must be a valid UUID' })
  user_id?: string;

  @ApiPropertyOptional({ description: 'Filter by department UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'department_id must be a valid UUID' })
  department_id?: string;

  @ApiPropertyOptional({ description: 'Filter by designation UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'designation_id must be a valid UUID' })
  designation_id?: string;

  @ApiPropertyOptional({ description: 'Filter by role UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'role_id must be a valid UUID' })
  role_id?: string;

  @ApiPropertyOptional({ description: 'Filter by shift UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'shift_id must be a valid UUID' })
  shift_id?: string;

  @ApiPropertyOptional({ description: 'Filter by job category UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'job_category_id must be a valid UUID' })
  job_category_id?: string;

  @ApiPropertyOptional({
    description:
      'Filter to the direct reports of this Team Lead. Powers the "My Team" section.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'team_lead_id must be a valid UUID' })
  team_lead_id?: string;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES, {
    message: `employee_type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`,
  })
  employee_type?: string;

  @ApiPropertyOptional({
    description: 'Filter by active (true) / inactive (false).',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'status must be true or false' })
  status?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, returns only users who hold the Team Lead role. Powers the Team Leads tab.',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'team_leads_only must be true or false' })
  team_leads_only?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, includes the direct-report count on each row (extra subquery).',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'include_team_count must be true or false' })
  include_team_count?: boolean;

  @ApiPropertyOptional({ enum: EMPLOYEE_SORT_FIELDS, default: 'created_at' })
  @IsOptional()
  @IsIn(EMPLOYEE_SORT_FIELDS, {
    message: `sortBy must be one of: ${EMPLOYEE_SORT_FIELDS.join(', ')}`,
  })
  @Type(() => String)
  declare sortBy?: EmployeeSortField;
}
