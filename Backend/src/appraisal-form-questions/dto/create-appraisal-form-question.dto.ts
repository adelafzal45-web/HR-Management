import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppraisalFormQuestionDto {
  @ApiProperty({
    description: 'Appraisal Form UUID',
    example: '7c3ef4d2-28c7-4f5b-8cdb-5dd5d8d2b0f1',
  })
  @IsUUID()
  form_id!: string;

  @ApiProperty({
    description: 'Appraisal Question UUID',
    example: 'f2cb5e88-5f45-44d4-b0d3-43f63bc57e8b',
  })
  @IsUUID()
  question_id!: string;

  @ApiPropertyOptional({
    description: 'Display order of question inside the form',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  display_order?: number = 1;

  @ApiProperty({
    description: 'Weight percentage of this question',
    example: 20,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight_percentage!: number;

  @ApiPropertyOptional({
    description: 'Whether answering this question is mandatory',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean = true;
}
