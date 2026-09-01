import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayrollCalculationService } from './payroll-calculation.service';
import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';
import { PayrollPeriod } from '../payroll-periods/payroll-periods.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { Payslip, PayslipLine } from '../payslips/payslips.entity';
import {
  SalaryStructureAssignment,
  SalaryStructureComponent,
  EmployeeComponentOverride,
} from '../salary-structures/salary-structures.entity';
import { PayrollBonusOverride } from '../payroll-bonus-overrides/payroll-bonus-overrides.entity';
import { HolidaysModule } from '../holidays/holidays.module';
import { PayrollRulesModule } from '../payroll-rules/payroll-rules.module';
import { PayrollTaxModule } from '../payroll-tax/payroll-tax.module';
import { PayrollLoansModule } from '../payroll-loans/payroll-loans.module';
import { ReimbursementsModule } from '../reimbursements/reimbursements.module';

/**
 * The payroll rule engine (spec §11/§14).
 *
 * Holds no controller of its own — it exposes `PayrollCalculationService`,
 * which the payslips and payroll-periods modules use to preview and generate.
 * It reads across users, attendance, leave, structures, and settings, so it
 * registers those entities for its own repositories and imports HolidaysModule
 * for the shared working-day/holiday calendar. Phase 2 pulls in the rules, tax,
 * and loans modules for the rule resolver, tax config, and loan installments;
 * Phase 3 adds reimbursements for the non-taxable expense-claim earning line.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Attendance,
      LeaveRequest,
      PayrollPeriod,
      PayrollSettings,
      SalaryStructureAssignment,
      SalaryStructureComponent,
      EmployeeComponentOverride,
      Payslip,
      PayslipLine,
      PayrollBonusOverride,
    ]),
    HolidaysModule,
    PayrollRulesModule,
    PayrollTaxModule,
    PayrollLoansModule,
    ReimbursementsModule,
  ],
  providers: [PayrollCalculationService],
  exports: [PayrollCalculationService, TypeOrmModule],
})
export class PayrollEngineModule {}
