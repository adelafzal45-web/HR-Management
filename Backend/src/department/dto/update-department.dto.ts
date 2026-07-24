import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateDepartmentDto } from './create-department.dto';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiPropertyOptional({
    example: 'Software Engineering',
  })
  department_name?: string;

  @ApiPropertyOptional({
    example: 'Updated department description',
  })
  description?: string;
}
