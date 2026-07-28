import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreatePerformanceReviewAnswerDto {
  @ApiProperty({
    description: 'UUID of the performance review',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @IsUUID()
  @IsNotEmpty()
  review_id!: string;

  @ApiProperty({
    description: 'UUID of the appraisal question',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @IsUUID()
  @IsNotEmpty()
  question_id!: string;

  @ApiPropertyOptional({
    description:
      'UUID of the selected appraisal question option. Used for rating-type questions.',
    example: 'c12e45ab-7f4e-4f12-8e67-123456789abc',
  })
  @IsOptional()
  @IsUUID()
  selected_option_id?: string;

  @ApiPropertyOptional({
    description:
      'Text answer for a comment-type appraisal question.',
    example:
      'The employee consistently demonstrated strong communication skills.',
  })
  @IsOptional()
  @IsString()
  answer_comment?: string;

  @ApiPropertyOptional({
    description:
      'Calculated percentage score for this answer.',
    example: 85.50,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  answered_percentage?: number;
}