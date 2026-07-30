import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalForms } from './appraisal-forms.entity';
import { AppraisalFormsService } from './appraisal-forms.service';
import { AppraisalFormsController } from './appraisal-forms.controller';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppraisalForms]), AuthorizationModule],
  controllers: [AppraisalFormsController],
  providers: [AppraisalFormsService],
  exports: [AppraisalFormsService],
})
export class AppraisalFormsModule {}
