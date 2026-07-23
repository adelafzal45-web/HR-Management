import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    example: 'Ali',
    description: 'First name of the employee',
  })
  first_name!: string;

  @ApiProperty({
    example: 'Khan',
    description: 'Last name of the employee',
  })
  last_name!: string;

  @ApiProperty({
    example: 'ali@gmail.com',
  })
  email!: string;

  @ApiProperty({
    example: 'Ali@123',
  })
  password!: string;

  @ApiProperty({
    example: '03001234567',
    required: false,
  })
  phone?: string;

  @ApiProperty({
    example: 'Permanent',
    required: false,
  })
  employee_type?: string;

  @ApiProperty({
    example: 'designation-uuid',
    description: 'Designation UUID',
  })
  designationId!: string;

  @ApiProperty({
    example: '2026-07-21',
  })
  joining_date!: Date;

  @ApiProperty({
    example: 85000,
    required: false,
  })
  salary?: number;

  @ApiProperty({
    example: true,
    required: false,
  })
  status?: boolean;

  @ApiProperty({
    example: 'role-uuid',
    description: 'Role UUID',
  })
  roleId!: string;

  @ApiProperty({
    example: 'department-uuid',
    description: 'Department UUID',
  })
  departmentId!: string;
}
