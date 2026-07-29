import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalQuestionOption } from './apprisal-question-options.entity';

import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

import { AppraisalQuestionOptionsController } from './apprisal-question-options.controller';

import { AppraisalQuestionOptionsService } from './apprisal-question-options.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppraisalQuestionOption,
      AppraisalQuestion,
    ]),
     AuthorizationModule
  ],

  controllers: [
    AppraisalQuestionOptionsController,
  ],

  providers: [
    AppraisalQuestionOptionsService,
  ],

  exports: [
    AppraisalQuestionOptionsService,
  ],
})
export class AppraisalQuestionOptionsModule {}