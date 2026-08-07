import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'employees.create',
    description:
      'Unique permission name in `module.action` form. Every module follows the same format (shifts, roles, appraisal, attendance, ...).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  permission_name!: string;

  @ApiProperty({
    example: 'Allows the user to create new users.',
    description: 'Description of the permission',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
