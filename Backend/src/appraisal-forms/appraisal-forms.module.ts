import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalForms } from './appraisal-forms.entity';
import { AppraisalFormAssignment } from './appraisal-form-assignment.entity';
import {
  TeamLeadAssignment,
  TeamLeadAssignmentMember,
} from './team-lead-assignment.entity';
import { AppraisalFormsService } from './appraisal-forms.service';
import { AppraisalFormResolverService } from './appraisal-form-resolver.service';

import { User } from '../users/user.entity';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppraisalForms,
      AppraisalFormAssignment,
      TeamLeadAssignment,
      TeamLeadAssignmentMember,
      User,
    ]),
    AuthorizationModule,
  ],
  // No controller: forms are managed through /appraisal/forms on the facade,
  // which owns the Draft -> Published -> Archived lifecycle. The services are
  // still exported because the facade reuses them.
  //
  // This module has no dependency on the facade or on performance-review, which
  // is what lets both of those import the resolver without a cycle.
  providers: [AppraisalFormsService, AppraisalFormResolverService],
  exports: [AppraisalFormsService, AppraisalFormResolverService],
})
export class AppraisalFormsModule {}
