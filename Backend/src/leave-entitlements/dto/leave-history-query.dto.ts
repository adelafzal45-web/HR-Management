import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { LeaveHistoryType } from '../leave-history.entity';

export class LeaveHistoryQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ enum: LeaveHistoryType })
  @IsOptional()
  @IsEnum(LeaveHistoryType)
  type?: LeaveHistoryType;
}
