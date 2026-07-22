import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {

  @ApiProperty({
    example: 'HR Manager',
    description: 'Name of the role',
  })
  role_name!: string;

  @ApiProperty({
    example: 'Responsible for managing employees and HR operations.',
    description: 'Role description',
    required: false,
  })
  description?: string;
}