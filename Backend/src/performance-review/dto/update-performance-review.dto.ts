import { PartialType } from '@nestjs/mapped-types';
import { CreatePerformanceReviewDto } from './create-performance-review.dto';

export class UpdatePerformanceReviewDto extends PartialType(
  CreatePerformanceReviewDto,
) {}
