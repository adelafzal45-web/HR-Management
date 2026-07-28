import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateAppraisalQuestionOptionDto {
  @ApiProperty({
    description: 'UUID of the appraisal question',
    example: '7f8b9c12-1234-4567-8901-123456789abc',
  })
  @IsUUID()
  questionId!: string;

  @ApiProperty({
    description: 'Text displayed for this appraisal option',
    example: 'Excellent',
  })
  @IsString()
  @IsNotEmpty()
  option_text!: string;

  @ApiProperty({
    description: 'Score assigned to this option',
    example: 100,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  @ApiProperty({
    description: 'Order in which the option should be displayed',
    example: 4,
  })
  @IsInt()
  @Min(1)
  display_order!: number;
}