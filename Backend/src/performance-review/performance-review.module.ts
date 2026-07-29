import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PerformanceReview } from './performance-review.entity';
import { PerformanceReviewController } from './performance-review.controller';
import { PerformanceReviewService } from './performance-review.service';

import { User } from '../users/user.entity';

import { PerformanceReviewAnswer } from '../performance-review-answer/performance-review-answer.entity';
import { AuthorizationModule } from '../authorization/authorization.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceReview,
      User,
      PerformanceReviewAnswer,
    ]),
    AuthorizationModule 
  ],

  controllers: [
    PerformanceReviewController,
  ],

  providers: [
    PerformanceReviewService,
  ],

  exports: [
    PerformanceReviewService,
  ],
})
export class PerformanceReviewModule {}