import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePerformanceReviewAnswerDto {
  @ApiProperty({
    description: 'Performance Review UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @IsUUID()
  @IsNotEmpty()
  review_id!: string;

  @ApiProperty({
    description: 'Appraisal Form Question UUID',
    example: '31bb67ea-3b8c-4d1d-bd9e-2d50cb3f9f67',
  })
  @IsUUID()
  @IsNotEmpty()
  form_question_id!: string;

  @ApiPropertyOptional({
    description: 'Selected option UUID (for Rating/Radio questions)',
    example: 'c12e45ab-7f4e-4f12-8e67-123456789abc',
  })
  @IsOptional()
  @IsUUID()
  selected_option_id?: string;

  @ApiPropertyOptional({
    description: 'Comment/Text answer',
    example: 'Excellent communication throughout the sprint.',
  })
  @IsOptional()
  @IsString()
  answer_comment?: string;

  @ApiPropertyOptional({
    description: 'Calculated percentage for this answer',
    example: 20,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  answered_percentage?: number;

  @ApiPropertyOptional({
    description: 'Automatically marked zero because employee was absent',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  is_absent_auto_zero?: boolean;
}
