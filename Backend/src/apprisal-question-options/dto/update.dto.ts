import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateAppraisalQuestionOptionDto } from './create.dto';

export class UpdateAppraisalQuestionOptionDto extends PartialType(
  CreateAppraisalQuestionOptionDto,
) {
  @ApiPropertyOptional({
    example: 'Very Good',
  })
  option_text?: string;

  @ApiPropertyOptional({
    example: 90,
    minimum: 0,
    maximum: 100,
  })
  score?: number;

  @ApiPropertyOptional({
    example: 3,
  })
  display_order?: number;
}