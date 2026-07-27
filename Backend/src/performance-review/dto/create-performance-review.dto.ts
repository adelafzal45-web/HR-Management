import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePerformanceReviewDto {
  @ApiProperty({
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'User ID of the employee being reviewed',
  })
  @IsUUID()
  @IsNotEmpty()
  user_id!: string;

  @ApiProperty({
    example: '9a7c6d4e-2b1f-4c8a-9d5e-987654321abc',
    description: 'Appraisal question ID associated with this review',
  })
  @IsUUID()
  @IsNotEmpty()
  question_id!: string;

  @ApiProperty({
    example: 'Q1 2026',
    description: 'Performance review period',
  })
  @IsString()
  @IsNotEmpty()
  review_period!: string;

  @ApiProperty({
    example: 4.5,
    description: 'Performance rating given to the employee',
    minimum: 0,
    maximum: 5,
  })
  @IsNumber()
  @Min(0)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({
    example: 'Employee has shown excellent teamwork and communication skills.',
    description: 'Additional comments about employee performance',
  })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiProperty({
    example: '2026-07-24',
    description: 'Date when the performance review was conducted',
  })
  @IsDateString()
  review_date!: Date;
}
