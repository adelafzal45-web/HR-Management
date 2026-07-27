import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalQuestion } from './appraisal-question.entity';
import { User } from '../users/user.entity';

import { AppraisalQuestionController } from './appraisal-question.controller';
import { AppraisalQuestionService } from './appraisal-question.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppraisalQuestion, User])],
  controllers: [AppraisalQuestionController],
  providers: [AppraisalQuestionService],
  exports: [AppraisalQuestionService],
})
export class AppraisalQuestionModule {}
