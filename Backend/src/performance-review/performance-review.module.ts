import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PerformanceReview } from './performance-review.entity';
import { PerformanceReviewController } from './performance-review.controller';
import { PerformanceReviewService } from './performance-review.service';

import { User } from '../users/user.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceReview, User, AppraisalQuestion]),
  ],
  controllers: [PerformanceReviewController],
  providers: [PerformanceReviewService],
  exports: [PerformanceReviewService],
})
export class PerformanceReviewModule {}
