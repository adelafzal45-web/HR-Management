import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalFacadeService } from './appraisal-facade.service';
import { AppraisalQuestionBankService } from './appraisal-question-bank.service';
import { AppraisalWorkflowService } from './appraisal-workflow.service';
import { AppraisalSchedulerService } from './appraisal-scheduler.service';
import { AppraisalStatsService } from './appraisal-stats.service';
import { AppraisalFacadeController } from './appraisal-facade.controller';

import { User } from '../users/user.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
import { AppraisalFormAssignment } from '../appraisal-forms/appraisal-form-assignment.entity';
import {
  TeamLeadAssignment,
  TeamLeadAssignmentMember,
} from '../appraisal-forms/team-lead-assignment.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import { ReviewApproval } from '../performance-review/review-approval.entity';
import { PerformanceReviewAnswer } from '../performance-review-answer/performance-review-answer.entity';
import { AppraisalNotification } from '../appraisal-notifications/appraisal-notification.entity';
import { Attendance } from '../attendance/attendance.entity';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';
import { Shift } from '../shifts/shifts.entity';
import { Department } from '../department/department.entity';
import { Designation } from '../designation/designation.entity';

import { AuthorizationModule } from '../authorization/authorization.module';
import { AppraisalFormsModule } from '../appraisal-forms/appraisal-forms.module';
import { PerformanceReviewModule } from '../performance-review/performance-review.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { WorkingDaySchedulesModule } from '../working-day-schedules/working-day-schedules.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AppraisalForms,
      AppraisalFormAssignment,
      TeamLeadAssignment,
      TeamLeadAssignmentMember,
      AppraisalQuestion,
      AppraisalQuestionOption,
      AppraisalFormQuestion,
      PerformanceReview,
      ReviewApproval,
      PerformanceReviewAnswer,
      AppraisalNotification,
      Attendance,
      LeaveRequest,
      Shift,
      Department,
      Designation,
    ]),
    AuthorizationModule,
    AppraisalFormsModule,
    PerformanceReviewModule,
    AuditModule,
    MailModule,
    WorkingDaySchedulesModule,
  ],
  // TeamController was removed: GET /team/members is superseded by
  // GET /appraisal/my-team, which returns the same roster plus pendingCount and
  // the resolved form per member.
  controllers: [AppraisalFacadeController],
  providers: [
    AppraisalFacadeService,
    AppraisalQuestionBankService,
    AppraisalWorkflowService,
    AppraisalSchedulerService,
    AppraisalStatsService,
  ],
  exports: [
    AppraisalFacadeService,
    AppraisalQuestionBankService,
    AppraisalWorkflowService,
    AppraisalStatsService,
  ],
})
export class AppraisalFacadeModule {}
