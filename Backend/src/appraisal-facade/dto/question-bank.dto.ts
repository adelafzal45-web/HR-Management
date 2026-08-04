import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { QuestionType } from '../../appraisal-question/appraisal-question.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * One selectable answer on an option-based question.
 *
 * `score` is the raw value the option is worth. It is normalised against the
 * highest-scoring option on the same question at submit time, so a yes/no pair
 * of 10/0 and one of 1/0 both resolve to 100% / 0% — HR can use whatever
 * numbers read naturally without changing what a submission is worth.
 */
export class QuestionOptionInputDto {
  @ApiPropertyOptional({
    description: 'Existing option_id. Omit to create a new option.',
  })
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiProperty({ example: 'Exceeds expectations' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  optionText!: string;

  @ApiProperty({ example: 10, minimum: 0, maximum: 999.99 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999.99)
  score!: number;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  displayOrder?: number;
}

export class CreateBankQuestionDto {
  @ApiProperty({ example: 'How well does this employee communicate?' })
  @IsString()
  @MinLength(1)
  questionText!: string;

  @ApiProperty({ enum: QuestionType, example: QuestionType.RATING })
  @IsEnum(QuestionType)
  questionType!: QuestionType;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Required for `multiple_choice` and `dropdown` (2 or more). Optional for
   * `yes_no`, which defaults to Yes = 10 / No = 0 when omitted. Rejected for
   * `rating` and `text_feedback`, which have no option list.
   *
   * Capped at 20 — an option list longer than that is a data-entry field
   * wearing a dropdown's clothes, and every option is re-read on every render
   * of every form referencing the question.
   */
  @ApiPropertyOptional({ type: [QuestionOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];
}

/**
 * Every field optional, but `questionType` may not change once a form
 * references the question — the service rejects that rather than silently
 * invalidating the answers already recorded against the old type.
 */
export class UpdateBankQuestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  questionText?: string;

  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [QuestionOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];
}

export class BankQuestionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  /**
   * Accepts the strings 'true'/'false' as well as booleans, because this
   * arrives as a query string. `@Type(() => Boolean)` alone would coerce the
   * string 'false' to `true`, which is the wrong answer and a silent one.
   */
  @ApiPropertyOptional({ description: 'Filter by active state' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  isActive?: string;
}
