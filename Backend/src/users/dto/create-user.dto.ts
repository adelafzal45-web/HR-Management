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

  // ==========================
  // RELATION IDs
  // ==========================

  @ApiProperty({
    example: '51323aec-760f-40a6-8660-fac0483079dc',
    description: 'Role UUID',
  })
  role_id!: string;

  @ApiProperty({
    example: 'department-uuid',
    description: 'Department UUID',
  })
  department_id!: string;

  @ApiProperty({
    example: 'designation-uuid',
    description: 'Designation UUID',
  })
  designation_id!: string;

  @ApiProperty({
    example: 'job-category-uuid',
    description: 'Job Category UUID',
  })
  job_category_id!: string;

  @ApiProperty({
    example: 'shift-uuid',
    description: 'Shift UUID',
  })
  shift_id!: string;
}
