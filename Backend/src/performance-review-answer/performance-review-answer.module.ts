import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PerformanceReviewAnswer } from './performance-review-answer.entity';
import { PerformanceReviewAnswerController } from './performance-review-answer.controller';
import { PerformanceReviewAnswerService } from './performance-review-answer.service';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';
import { AuthorizationModule } from '../authorization/authorization.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceReviewAnswer,
      PerformanceReview,
      AppraisalQuestion,
      AppraisalQuestionOption,
    ]),
     AuthorizationModule
  ],

  controllers: [
    PerformanceReviewAnswerController,
  ],

  providers: [
    PerformanceReviewAnswerService,
  ],

  exports: [
    PerformanceReviewAnswerService,
  ],
})
export class PerformanceReviewAnswerModule {}