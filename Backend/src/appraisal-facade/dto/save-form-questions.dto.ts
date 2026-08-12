import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { QuestionType } from '../../appraisal-question/appraisal-question.entity';
import { QuestionOptionInputDto } from './question-bank.dto';

/**
 * One question on a form, as sent by the HR form builder.
 *
 * Two ways to put a question on a form:
 *
 *  - **Reuse** — send `bankQuestionId`. The form links to that bank row, and
 *    `questionText` / `questionType` / `options` are ignored: the bank owns the
 *    wording, and editing it through a form would be an invisible edit to every
 *    other form using it. Edit it via `PUT /appraisal/questions/:id` instead,
 *    where the response tells you which forms it reached.
 *  - **Inline** — omit `bankQuestionId` and send the text. This still creates a
 *    real bank row (nothing is private any more), so it can be reused later.
 *
 * `questionId` is this form's own `form_question_id`, used to update an existing
 * link. It is not the bank id — a form can only hold one link per row, but the
 * same bank question may appear on many forms.
 */
export class FormQuestionInputDto {
  @ApiPropertyOptional({
    description: 'Existing form_question_id (omit for new)',
  })
  @IsOptional()
  @IsUUID()
  questionId?: string;

  @ApiPropertyOptional({
    description:
      'Link an existing question bank entry. When set, questionText / questionType / options are ignored.',
  })
  @IsOptional()
  @IsUUID()
  bankQuestionId?: string;

  /**
   * Required unless `bankQuestionId` is set — the service enforces that pairing,
   * because class-validator cannot express "one of these two" without making
   * both optional and losing the per-field message.
   */
  @ApiPropertyOptional({ example: 'Job Knowledge' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  questionText?: string;

  @ApiPropertyOptional({
    enum: QuestionType,
    default: QuestionType.RATING,
    description: 'Defaults to rating, which is the pre-existing behaviour.',
  })
  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  /**
   * Optional helper text under the title. Belongs to this form link, not to the
   * bank question — the same reusable question may need different framing on a
   * Daily engineering form than on a Monthly sales one.
   */
  @ApiPropertyOptional({
    example: 'Judge consistency across the period, not a single good week.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Options for `multiple_choice` / `dropdown` (2–20, each scored) and
   * optionally `yes_no` (defaults to Yes = 10 / No = 0). Rejected for `rating`
   * and `text_feedback`.
   */
  @ApiPropertyOptional({ type: [QuestionOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];

  /**
   * Share of the form's 100% total. Must be 0 for `text_feedback`: there is
   * nothing to score, so weight on it would shrink the scored denominator and
   * inflate every total.
   */
  @ApiProperty({ example: 25, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weightage!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;

  @ApiPropertyOptional({
    example: 10,
    minimum: 2,
    maximum: 100,
    description: 'Reviewers rate ratingMin..ratingScale. Defaults to 10.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  ratingScale?: number;

  @ApiPropertyOptional({
    example: 1,
    enum: [0, 1],
    description:
      'Lower bound of the rating scale. 1 (default) matches the classic ' +
      '1–5 / 1–10 presets; 0 lets reviewers pick 0 as the lowest score.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  ratingMin?: number;

  @ApiPropertyOptional({ example: 'Needs improvement' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  minLabel?: string;

  @ApiPropertyOptional({ example: 'Consistently exceeds' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  maxLabel?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Reviewers must answer this question before submitting.',
  })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class SaveFormQuestionsDto {
  @ApiProperty({ type: [FormQuestionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormQuestionInputDto)
  questions!: FormQuestionInputDto[];
}
