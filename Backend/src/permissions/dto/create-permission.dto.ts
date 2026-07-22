import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {

  @ApiProperty({
    example: 'CREATE_USER',
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