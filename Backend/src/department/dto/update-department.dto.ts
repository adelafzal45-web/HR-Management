import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

import { CreateDepartmentDto } from './create-department.dto';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiPropertyOptional({
    example: 'Software Engineering',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department_name?: string;

  @ApiPropertyOptional({
    example: 'Updated department description',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
