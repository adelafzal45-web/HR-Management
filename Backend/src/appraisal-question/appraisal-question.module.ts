import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalQuestion } from './appraisal-question.entity';

import { AppraisalQuestionService } from './appraisal-question.service';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppraisalQuestion]), AuthorizationModule],
  // No controller: questions are authored through
  // PUT /appraisal/forms/:formId/questions on the facade, which enforces the
  // weights-total-100 rule that this generic CRUD surface bypassed.
  providers: [AppraisalQuestionService],
  exports: [AppraisalQuestionService],
})
export class AppraisalQuestionModule {}
