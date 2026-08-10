import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ==========================================
// PAYROLL CONTROLLER & SERVICES
// ==========================================

import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

import { PayrollCalculationService } from './services/payroll-calculation.service';
import { PayrollTaxService } from './services/payroll-tax.service';
import { PayrollAttendanceService } from './services/payroll-attendance.service';
import { PayrollLeaveService } from './services/payroll-leave.service';
import { PayrollLoanService } from './services/payroll-loan.service';
import { PayrollReimbursementService } from './services/payroll-reimbursement.service';
import { PayrollAuditService } from './services/payroll-audit.service';

// ==========================================
// PAYROLL ENTITIES
// ==========================================

import { Payroll } from './payroll.entity';
import { PayrollItem } from './payroll-item.entity';
import { PayrollAdjustment } from './payroll-adjustment.entity';
import { PayrollAuditLog } from './payroll-audit-log.entity';

// ==========================================
// OTHER MODULES
// ==========================================

import { UserModule } from '../users/users.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveRequestsModule} from '../leave-requests/leave-requests.module';
import { LoansModule } from '../loans/loans.module';
import { ReimbursementsModule } from '../reimbursements/reimbursements.module';
import { TaxModule } from '../tax/tax.module';

// ==========================================
// PAYROLL MODULE
// ==========================================

@Module({
  imports: [
    // ==========================================
    // PAYROLL ENTITIES
    // ==========================================

    TypeOrmModule.forFeature([
      Payroll,
      PayrollItem,
      PayrollAdjustment,
      PayrollAuditLog,
    ]),

    // ==========================================
    // EMPLOYEE / USER
    // ==========================================

    UserModule,

    // ==========================================
    // ATTENDANCE
    // ==========================================

    AttendanceModule,

    // ==========================================
    // LEAVE MANAGEMENT
    // ==========================================

    LeaveRequestsModule,

    // ==========================================
    // LOANS
    // ==========================================

    forwardRef(() => LoansModule),

    // ==========================================
    // REIMBURSEMENTS
    // ==========================================

    ReimbursementsModule,

    // ==========================================
    // TAX
    // ==========================================

    TaxModule,
  ],

  controllers: [
    PayrollController,
  ],

  providers: [
    // Main payroll orchestration service
    PayrollService,

    // Calculation services
    PayrollCalculationService,
    PayrollTaxService,

    // Integration services
    PayrollAttendanceService,
    PayrollLeaveService,
    PayrollLoanService,
    PayrollReimbursementService,

    // Audit
    PayrollAuditService,
  ],

  exports: [
    PayrollService,
    PayrollCalculationService,
    PayrollTaxService,
    PayrollAuditService,
  ],
})
export class PayrollModule {}
