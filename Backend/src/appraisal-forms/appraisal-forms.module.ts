import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalForms } from './appraisal-forms.entity';
import {
  TeamLeadAssignment,
  TeamLeadAssignmentMember,
} from './team-lead-assignment.entity';
import { AppraisalFormsService } from './appraisal-forms.service';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppraisalForms,
      TeamLeadAssignment,
      TeamLeadAssignmentMember,
    ]),
    AuthorizationModule,
  ],
  // No controller: forms are managed through /appraisal/forms on the facade,
  // which owns the Draft -> Published -> Archived lifecycle. The service is
  // still exported because the facade reuses it.
  providers: [AppraisalFormsService],
  exports: [AppraisalFormsService],
})
export class AppraisalFormsModule {}
