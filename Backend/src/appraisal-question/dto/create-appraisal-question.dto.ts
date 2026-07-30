import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateAppraisalQuestionDto {
  @ApiProperty({
    example: 'How well does the employee communicate with team members?',
    description: 'Appraisal question',
  })
  @IsString()
  @IsNotEmpty()
  question_text!: string;

  @ApiProperty({
    example: 'Rating',
    description: 'Question type',
  })
  @IsString()
  @IsNotEmpty()
  question_type!: string;

  @ApiProperty({
    example: true,
    description: 'Question status',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
