import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({
    example: 'Software Engineering',
    description: 'Name of the department',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department_name!: string;

  @ApiProperty({
    example: 'Responsible for software development and maintenance.',
    description: 'Description of the department',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
