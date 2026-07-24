import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    example: 'EMP-001',
  })
  employee_code!: string;

  @ApiProperty({
    example: 'Ali',
  })
  first_name!: string;

  @ApiProperty({
    example: 'Khan',
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
    example: 'https://abc.com/profile.jpg',
    required: false,
  })
  profile_image?: string;

  @ApiProperty({
    example: '1999-08-14',
    required: false,
  })
  date_of_birth?: Date;

  @ApiProperty({
    example: 'Male',
    required: false,
  })
  gender?: string;

  @ApiProperty({
    example: 'Lahore, Pakistan',
    required: false,
  })
  address?: string;

  @ApiProperty({
    example: 'Permanent',
  })
  employee_type!: string;

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
  })
  roleId!: string;

  @ApiProperty({
    example: 'department-uuid',
  })
  departmentId!: string;

  @ApiProperty({
    example: 'designation-uuid',
  })
  designationId!: string;

  @ApiProperty({
    example: 'job-category-uuid',
  })
  jobCategoryId!: string;

  @ApiProperty({
    example: 'shift-uuid',
  })
  shiftId!: string;

  
}