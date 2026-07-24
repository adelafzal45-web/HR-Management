import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateRolePermissionDto } from './create-role-permission.dto';

export class UpdateRolePermissionDto extends PartialType(
  CreateRolePermissionDto,
) {
  @ApiPropertyOptional({
    example: '2e0e9d71-0dc8-46c9-8d8b-1e6b5fce8b8a',
  })
  roleId?: string;

  @ApiPropertyOptional({
    example: '4c1d20e4-3b1e-4a58-9d98-17a2b5a7c0d8',
  })
  permissionId?: string;
}