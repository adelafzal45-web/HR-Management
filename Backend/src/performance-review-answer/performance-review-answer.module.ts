import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PerformanceReviewAnswer } from './performance-review-answer.entity';
import { PerformanceReviewAnswerService } from './performance-review-answer.service';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceReviewAnswer,
      PerformanceReview,
      AppraisalFormQuestion,
      AppraisalQuestionOption,
    ]),
    AuthorizationModule,
  ],

  // No controller: answers are only ever written through
  // POST /appraisal/evaluate/:employeeId on the facade.
  providers: [PerformanceReviewAnswerService],

  exports: [PerformanceReviewAnswerService],
})
export class PerformanceReviewAnswerModule {}
