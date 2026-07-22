import { ApiProperty } from '@nestjs/swagger';

export class CreateDepartmentDto {

  @ApiProperty({
    example: 'Software Engineering',
    description: 'Name of the department',
  })
  department_name!: string;

  @ApiProperty({
    example: 'Responsible for software development and maintenance.',
    description: 'Description of the department',
    required: false,
  })
  description?: string;
}