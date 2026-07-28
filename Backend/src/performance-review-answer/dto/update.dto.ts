import { PartialType } from '@nestjs/swagger';

import { CreatePerformanceReviewAnswerDto } from './create.dto';

export class UpdatePerformanceReviewAnswerDto extends PartialType(
  CreatePerformanceReviewAnswerDto,
) {}