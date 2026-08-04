import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * One per-criterion answer, keyed by the criterion's `form_question_id`.
 *
 * Which field carries the answer depends on the question's type, and the service
 * validates the pairing rather than guessing:
 *
 *  - `rating`                          → `score`, 0..ratingScale
 *  - `yes_no` / `multiple_choice`
 *    / `dropdown`                      → `selectedOptionId`
 *  - `text_feedback`                   → `remarks` only; unscored
 *
 * `score` and `selectedOptionId` are both optional here because no single
 * question needs both. Sending the wrong one for a type is a 400 with the type
 * named, not a silent zero.
 */
export class EvaluationScoreInputDto {
  @ApiProperty({ description: 'form_question_id of the criterion' })
  @IsString()
  @MinLength(1)
  questionId!: string;

  @ApiPropertyOptional({
    example: 8,
    minimum: 0,
    description:
      "Rating questions only. Raw rating on the question's own scale " +
      '(0..ratingScale). The upper bound is validated server-side against that ' +
      'question, since each question defines its own scale.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  score?: number;

  @ApiPropertyOptional({
    description:
      'Option-based questions only (yes_no, multiple_choice, dropdown). Must be ' +
      "one of that question's own options.",
  })
  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @ApiPropertyOptional({
    description:
      'Free-text remarks. The whole answer for text_feedback questions, ' +
      'optional commentary on any other type.',
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SubmitEvaluationDto {
  // employeeId comes from the route param; accepted in the body too for parity
  // with the frontend payload but ignored server-side.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty({ example: 'Jul – Dec 2026' })
  @IsString()
  @MinLength(1)
  reviewPeriod!: string;

  @ApiProperty({ example: 'Strong performer this cycle.' })
  @IsString()
  comments!: string;

  @ApiProperty({ example: 'Recommended for increment.' })
  @IsString()
  recommendation!: string;

  @ApiProperty({ type: [EvaluationScoreInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreInputDto)
  scores!: EvaluationScoreInputDto[];
}
