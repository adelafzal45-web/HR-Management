import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class EntitlementQueryDto extends PaginationQueryDto {
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
}
