import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../users/users.module';

import { LeaveRequest } from './leave-requests.entity';
import { User } from '../users/user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';
import { UserLeaveBalance } from '../users/user-leave-balance.entity';

import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, User, LeaveType, UserLeaveBalance]),
    AuthorizationModule,
    UserModule,
  ],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
