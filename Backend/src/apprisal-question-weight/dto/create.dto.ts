import { ApiProperty } from '@nestjs/swagger';

import {
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateAppraisalQuestionWeightDto {
  @ApiProperty({
    description: 'UUID of the appraisal question',
    example:
      '7f8b9c12-1234-4567-8901-123456789abc',
  })
  @IsUUID()
  questionId!: string;

  @ApiProperty({
    description:
      'Percentage weight assigned to this appraisal question',
    example: 15,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight_percentage!: number;
}