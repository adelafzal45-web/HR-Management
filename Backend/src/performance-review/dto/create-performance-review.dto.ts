import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { EvaluationType } from '../../appraisal-forms/appraisal-forms.entity';

export class CreatePerformanceReviewDto {
  @ApiProperty({
    description: 'Appraisal Form ID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @IsUUID()
  @IsNotEmpty()
  form_id!: string;

  @ApiProperty({
    description: 'Reviewer (Team Lead / Manager)',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @IsUUID()
  @IsNotEmpty()
  reviewer_id!: string;

  @ApiProperty({
    description: 'Employee being evaluated',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @IsUUID()
  @IsNotEmpty()
  reviewee_id!: string;

  @ApiProperty({
    enum: EvaluationType,
    example: EvaluationType.DAILY,
  })
  @IsEnum(EvaluationType)
  evaluation_type!: EvaluationType;

  @ApiProperty({
    description: 'Review Period',
    example: '2026-08-01',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  review_period!: string;

  @ApiProperty({
    description: 'Review Date',
    example: '2026-08-01',
  })
  @IsDateString()
  review_date!: string;

  @ApiPropertyOptional({
    description: 'Total Score Percentage',
    example: 85.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  total_score_percentage?: number;

  @ApiPropertyOptional({
    description: 'Draft | Submitted | Completed',
    example: 'Draft',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Review Comments',
    example: 'Excellent performance.',
  })
  @IsOptional()
  @IsString()
  comments?: string;
  @ApiProperty({
    description: 'Attendance ID',
    example: '1f40d503-c3d9-45ef-a2f2-a98d56b7c333',
  })
  @IsUUID()
  @IsNotEmpty()
  attendance_id!: string;
}
