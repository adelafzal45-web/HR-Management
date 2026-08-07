import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LeaveEntitlement } from './leave-entitlement.entity';
import { LeaveHistory } from './leave-history.entity';
import { User } from '../users/user.entity';
import { UserLeaveBalance } from '../users/user-leave-balance.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

import { LeaveEntitlementsService } from './leave-entitlements.service';
import { LeaveEntitlementsController } from './leave-entitlements.controller';
import { LeaveCalculationService } from './leave-calculation.service';

import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { WorkingDaySchedulesModule } from '../working-day-schedules/working-day-schedules.module';
import { HolidaysModule } from '../holidays/holidays.module';

/**
 * Leave Balance & Entitlement system: yearly grants, the leave-history
 * ledger, and working-day/holiday-aware day counting.
 *
 * Exports `LeaveEntitlementsService` (balance mutation used by
 * `LeaveRequestsModule` on approval/rejection) and `LeaveCalculationService`
 * (shared working-day counting).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeaveEntitlement,
      LeaveHistory,
      User,
      UserLeaveBalance,
      LeaveType,
    ]),
    AuthorizationModule,
    AuditModule,
    MailModule,
    WorkingDaySchedulesModule,
    HolidaysModule,
  ],
  controllers: [LeaveEntitlementsController],
  providers: [LeaveEntitlementsService, LeaveCalculationService],
  exports: [LeaveEntitlementsService, LeaveCalculationService],
})
export class LeaveEntitlementsModule {}
