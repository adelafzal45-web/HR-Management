import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePerformanceReviewDto {
  @ApiProperty({
    description: 'UUID of the employee conducting the review',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @IsUUID()
  @IsNotEmpty()
  reviewer_id!: string;

  @ApiProperty({
    description: 'UUID of the employee being reviewed',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @IsUUID()
  @IsNotEmpty()
  reviewee_id!: string;

  @ApiProperty({
    description: 'Review period',
    example: '2026-Q2',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  review_period!: string;

  @ApiProperty({
    description: 'Date on which the review was conducted',
    example: '2026-07-28',
  })
  @IsDateString()
  @IsNotEmpty()
  review_date!: string;

  @ApiPropertyOptional({
    description: 'Overall calculated score percentage',
    example: 85.50,
  })
  @IsOptional()
  total_score_percentage?: number;

  @ApiPropertyOptional({
    description: 'Overall comments about the employee',
    example: 'Excellent performance during this review period.',
  })
  @IsOptional()
  @IsString()
  comments?: string;
}