import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import { Payslip } from '../payslips/payslips.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';

import { AuthorizationModule } from '../authorization/authorization.module';
import { WorkingDaySchedulesModule } from '../working-day-schedules/working-day-schedules.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { AppraisalFacadeModule } from '../appraisal-facade/appraisal-facade.module';

/**
 * Read-only dashboard aggregates. Owns no entity of its own — it reads the
 * tables the other modules own and reuses their resolution services so a figure
 * shown on a dashboard cannot drift from the same figure on its own screen:
 *
 *  - `WorkingDaySchedulesService` for the designation → department → global
 *    working-week ladder,
 *  - `HolidaysService` for the shared holiday calendar,
 *  - `AppraisalFacadeService` for a team lead's roster.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Attendance,
      LeaveRequest,
      PerformanceReview,
      Payslip,
      PayrollSettings,
    ]),
    AuthorizationModule,
    WorkingDaySchedulesModule,
    HolidaysModule,
    AppraisalFacadeModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
