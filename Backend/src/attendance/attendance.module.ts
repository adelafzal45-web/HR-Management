import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Attendance } from './attendance.entity';
import { User } from '../users/user.entity';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([Attendance, User]),AuthorizationModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
