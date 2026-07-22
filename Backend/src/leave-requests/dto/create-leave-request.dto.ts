import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeaveRequestDto {
  @ApiProperty({
    example: 'Annual Leave',
    description: 'Type of leave requested.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  leave_type!: string;

  @ApiProperty({
    example: '2026-08-15',
    description: 'Leave start date.',
  })
  @IsDateString()
  start_date!: Date;

  @ApiProperty({
    example: '2026-08-18',
    description: 'Leave end date.',
  })
  @IsDateString()
  end_date!: Date;

  @ApiPropertyOptional({
    example: 'Family vacation',
    description: 'Reason for requesting leave.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    example: 'Pending',
    description: 'Current status of the leave request.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiProperty({
    example: 'db82907b-f347-4bb3-9d2e-f08d8ec2d5c5',
    description: 'UUID of the employee requesting leave.',
  })
  @IsUUID()
  user_id!: string;

  @ApiPropertyOptional({
    example: '0ab49780-8dc6-4c3b-9eb0-a7c3f8365c12',
    description: 'UUID of the manager approving the request.',
  })
  @IsOptional()
  @IsUUID()
  approved_by_id?: string;
}
