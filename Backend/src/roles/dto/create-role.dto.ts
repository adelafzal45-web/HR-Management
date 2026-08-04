import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'HR Manager',
    description: 'Name of the role',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  role_name!: string;

  @ApiProperty({
    example: 'Responsible for managing employees and HR operations.',
    description: 'Role description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
