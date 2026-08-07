import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalQuestionOption } from './apprisal-question-options.entity';

import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

/**
 * Entity registration only. The controller and service were removed: option rows
 * are read through the facade's question payloads, and the 3-role workflow rates
 * questions on a numeric scale rather than by picking option rows, so nothing
 * writes to this table any more. The entity stays because
 * PerformanceReviewAnswerModule still registers it via forFeature.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AppraisalQuestionOption, AppraisalQuestion]),
  ],
})
export class AppraisalQuestionOptionsModule {}
