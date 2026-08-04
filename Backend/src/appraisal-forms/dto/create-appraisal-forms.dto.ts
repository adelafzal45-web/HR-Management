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
import { IsUUID } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Department ID',
    example: 'd58a91b8-6c8f-41ef-a6f0-b26d74e8d999',
  })
  @IsOptional()
  @IsUUID()
  department_id?: string;

  @ApiPropertyOptional({
    description: 'Designation ID',
    example: 'ad11bfe8-d35d-41c0-87d5-90d69cf67b74',
  })
  @IsOptional()
  @IsUUID()
  designation_id?: string;

  @ApiPropertyOptional({
    description: 'Admin/User creating this form',
    example: 'ce931c3d-0b65-4d3f-bcb5-51a81d7d1e0a',
  })
  @IsOptional()
  @IsUUID()
  created_by?: string;
}
