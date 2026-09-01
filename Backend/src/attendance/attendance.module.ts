import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Attendance } from './attendance.entity';
import { User } from '../users/user.entity';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

import { PerformanceReviewModule } from '../performance-review/performance-review.module';

import { AuthorizationModule } from '../authorization/authorization.module';
import { WorkingDaySchedulesModule } from '../working-day-schedules/working-day-schedules.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, User]),

    forwardRef(() => PerformanceReviewModule),

    AuthorizationModule,

    // Attendance must know which days are working days before it can decide
    // what counts as an absence.
    WorkingDaySchedulesModule,

    // The company-wide attendance mode (Device vs Manual) gates self check-in.
    CompanySettingsModule,
  ],

  controllers: [AttendanceController],

  providers: [AttendanceService],

  exports: [AttendanceService],
})
export class AttendanceModule {}
