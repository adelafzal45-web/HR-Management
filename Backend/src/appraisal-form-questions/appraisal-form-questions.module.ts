import { Module } from '@nestjs/common';
import { AppraisalFormQuestionsService } from './appraisal-form-questions.service';
import { AppraisalFormQuestionsController } from './appraisal-form-questions.controller';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [AuthorizationModule],
  controllers: [AppraisalFormQuestionsController],
  providers: [AppraisalFormQuestionsService],
})
export class AppraisalFormQuestionsModule {}
