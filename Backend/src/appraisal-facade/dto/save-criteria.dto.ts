import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * One appraisal criterion as sent by the frontend Appraisal Criteria screen.
 * `questionId` is the existing form_question_id when editing, absent when new.
 */
export class CriterionInputDto {
  @ApiPropertyOptional({ description: 'Existing form_question_id (omit for new)' })
  @IsOptional()
  @IsString()
  questionId?: string;

  @ApiProperty({ example: 'Job Knowledge' })
  @IsString()
  @MinLength(1)
  questionText!: string;

  @ApiProperty({ example: 25, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weightage!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}

export class SaveCriteriaDto {
  @ApiProperty({ type: [CriterionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  questions!: CriterionInputDto[];
}
