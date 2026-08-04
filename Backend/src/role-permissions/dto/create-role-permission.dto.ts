import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateRolePermissionDto {
  @ApiProperty({
    example: '2b75d68c-b8d4-4cb7-b5dc-c03d66b8b2d7',
    description: 'UUID of the role',
  })
  @IsUUID()
  roleId!: string;

  @ApiProperty({
    example: '4fa82c18-53d3-43ef-91df-faaae95c4d9d',
    description: 'UUID of the permission',
  })
  @IsUUID()
  permissionId!: string;
}
