import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Reimbursement } from './reimbursement.entity';
import { ReimbursementsController } from './reimbursements.controller';
import { ReimbursementsService } from './reimbursements.service';
import { PayrollNotifierService } from './payroll-notifier.service';
import { User } from '../users/user.entity';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Employee expense claims (spec §2 reimbursement component, employee-initiated).
 *
 * Exports `ReimbursementsService` so the payroll engine can resolve the period's
 * approved claims (preview) and mark them paid (persist), and
 * `PayrollNotifierService` so the loans module can reuse the same bell
 * notifications for loan requests without a second recipient resolver.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Reimbursement, User]),
    AuthorizationModule,
    NotificationsModule,
  ],
  controllers: [ReimbursementsController],
  providers: [ReimbursementsService, PayrollNotifierService],
  exports: [ReimbursementsService, PayrollNotifierService, TypeOrmModule],
})
export class ReimbursementsModule {}
