import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateAppraisalQuestionDto {
  @ApiProperty({
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'User ID who created the appraisal question',
  })
  @IsUUID()
  user_id!: string;

  @ApiProperty({
    example: 'How well does the employee communicate with team members?',
    description: 'The appraisal question text',
  })
  @IsString()
  @IsNotEmpty()
  question_text!: string;

  @ApiProperty({
    example: 'Rating',
    description: 'Type of question used in appraisal evaluation',
  })
  @IsString()
  @IsNotEmpty()
  question_type!: string;

  @ApiProperty({
    example: 25,
    description: 'Weight percentage of this question in the appraisal',
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

  @ApiProperty({
    example: true,
    description: 'Defines whether this appraisal question is active',
  })
  @IsBoolean()
  is_active!: boolean;
}
