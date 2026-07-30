import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({
    example:
      'employees.create , employees.update, employees.delete, employees.view, employees.viewOwn, every other module should have same format, except their names, these are as shifts, roles, appraisal, attendance etc',
    description: 'Unique permission name',
  })
  permission_name!: string;

  @ApiProperty({
    example: 'Allows the user to create new users.',
    description: 'Description of the permission',
    required: false,
  })
  description?: string;
}
