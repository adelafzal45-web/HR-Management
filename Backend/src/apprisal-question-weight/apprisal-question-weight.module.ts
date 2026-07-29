import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalQuestionWeight } from './apprisal-question-weight.entity';

import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

import { AppraisalQuestionWeightsController } from './apprisal-question-weight.controller';

import { AppraisalQuestionWeightsService } from './apprisal-question-weight.service';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppraisalQuestionWeight,
      AppraisalQuestion,
    ]),
    AuthorizationModule
  ],

  controllers: [
    AppraisalQuestionWeightsController,
  ],

  providers: [
    AppraisalQuestionWeightsService,
  ],

  exports: [
    AppraisalQuestionWeightsService,
  ],
})
export class AppraisalQuestionWeightsModule {}
