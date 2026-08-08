import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LeaveRequest } from './leave-requests.entity';
import { User } from '../users/user.entity';
import { UserLeaveBalance } from '../users/user-leave-balance.entity';

import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveNotifierService } from './leave-notifier.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LeaveEntitlementsModule } from '../leave-entitlements/leave-entitlements.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, User, UserLeaveBalance]),
    AuthorizationModule,
    // Supplies balance deduction/restoration (LeaveEntitlementsService) and
    // working-day/holiday-aware day counting (LeaveCalculationService).
    LeaveEntitlementsModule,
    AuditModule,
    MailModule,
    // In-app notification dispatch for the leave events (LeaveNotifierService
    // fans out to employee + manager + HR through NotificationsService).
    NotificationsModule,
  ],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService, LeaveNotifierService],
  exports: [LeaveRequestsService, LeaveNotifierService],
})
export class LeaveRequestsModule {}