import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Query params for the Employee Leave Management report: a flat,
 * one-row-per-(employee, leave type) view used by the admin/HR DataTable
 * (search, department/leave-type/employee/status filters, sort by
 * employee/department/leaveType/remaining/status, pagination).
 */
export class LeaveBalanceReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  leave_type_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  department_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  designation_id?: string;

  /** Employee status: 'active' | 'inactive'. Omit for both. */
  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({
    enum: ['employee_name', 'department', 'leave_type', 'remaining', 'status'],
  })
  @IsOptional()
  @IsIn(['employee_name', 'department', 'leave_type', 'remaining', 'status'])
  declare sortBy?: string;
}
