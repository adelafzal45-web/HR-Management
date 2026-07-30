import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Attendance } from './attendance.entity';
import { User } from '../users/user.entity';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

import { PerformanceReviewModule } from '../performance-review/performance-review.module';

import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, User]),

    forwardRef(() => PerformanceReviewModule),

    AuthorizationModule,
  ],

  controllers: [AttendanceController],

  providers: [AttendanceService],

  exports: [AttendanceService],
})
export class AttendanceModule {}
