import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LeaveRequest } from './leave-requests.entity';
import { User } from '../users/user.entity';

import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LeaveEntitlementsModule } from '../leave-entitlements/leave-entitlements.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, User]),
    AuthorizationModule,
    // Supplies balance deduction/restoration (LeaveEntitlementsService) and
    // working-day/holiday-aware day counting (LeaveCalculationService).
    LeaveEntitlementsModule,
    AuditModule,
    MailModule,
  ],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService],
})
export class LeaveRequestsModule {}