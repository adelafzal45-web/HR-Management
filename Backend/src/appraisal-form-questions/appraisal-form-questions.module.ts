import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalFormQuestionsService } from './appraisal-form-questions.service';

import { AppraisalFormQuestion } from './appraisal-form-questions.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppraisalFormQuestion,
      AppraisalForms,
      AppraisalQuestion,
    ]),
    AuthorizationModule,
  ],
  // No controller: the form/question join is managed by the facade's
  // PUT /appraisal/forms/:formId/questions.
  providers: [AppraisalFormQuestionsService],
  exports: [AppraisalFormQuestionsService],
})
export class AppraisalFormQuestionsModule {}
