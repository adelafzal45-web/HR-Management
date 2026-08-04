import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiPropertyOptional({
    example: 'Senior HR Manager',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role_name?: string;

  @ApiPropertyOptional({
    example: 'Updated role description.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
