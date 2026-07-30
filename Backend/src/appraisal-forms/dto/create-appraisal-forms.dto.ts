import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationType } from '../appraisal-forms.entity';

export class CreateAppraisalFormsDto {
  @ApiProperty({
    example: 'Daily Performance Evaluation',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  form_name!: string;

  @ApiPropertyOptional({
    example: 'Daily employee performance evaluation.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: EvaluationType,
    example: EvaluationType.DAILY,
  })
  @IsEnum(EvaluationType)
  evaluation_type!: EvaluationType;

  @ApiProperty({
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
