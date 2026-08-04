import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

import { QuestionType } from '../appraisal-question.entity';

export class CreateAppraisalQuestionDto {
  @ApiProperty({
    example: 'How well does the employee communicate with team members?',
    description: 'Appraisal question',
  })
  @IsString()
  @IsNotEmpty()
  question_text!: string;

  @ApiProperty({
    enum: QuestionType,
    example: QuestionType.RATING,
    description:
      'Question type. Must be one of the five supported types; the database ' +
      'CHECK constraint CHK_aq_question_type rejects anything else.',
  })
  @IsEnum(QuestionType)
  question_type!: QuestionType;

  @ApiProperty({
    example: true,
    description: 'Question status',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
