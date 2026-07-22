import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiPropertyOptional({
    example: 'Senior HR Manager',
  })
  role_name?: string;

  @ApiPropertyOptional({
    example: 'Updated role description.',
  })
  description?: string;
}
