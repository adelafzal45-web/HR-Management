import { PartialType } from '@nestjs/mapped-types';

import { CreatePerformanceReviewAnswerDto } from './create.dto';

export class UpdatePerformanceReviewAnswerDto extends PartialType(
  CreatePerformanceReviewAnswerDto,
) {}
