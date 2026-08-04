import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PerformanceReview } from './performance-review.entity';
import { ReviewApproval } from './review-approval.entity';
import { PerformanceReviewService } from './performance-review.service';

import { User } from '../users/user.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
import { PerformanceReviewAnswer } from '../performance-review-answer/performance-review-answer.entity';

import { Attendance } from '../attendance/attendance.entity';

import { AttendanceModule } from '../attendance/attendance.module';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceReview,
      ReviewApproval,
      User,
      AppraisalForms,
      PerformanceReviewAnswer,
      Attendance,
    ]),

    forwardRef(() => AttendanceModule),

    AuthorizationModule,
  ],

  // No controller: the generic CRUD surface was superseded by
  // AppraisalFacadeController. The service is still exported because the facade
  // depends on recalculateReviewScore().
  providers: [PerformanceReviewService],

  exports: [PerformanceReviewService],
})
export class PerformanceReviewModule {}
