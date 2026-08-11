import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmployeeLoan, LoanInstallment } from './payroll-loans.entity';
import { PayrollLoansController } from './payroll-loans.controller';
import { PayrollLoansService } from './payroll-loans.service';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Employee loans / salary advances (spec §9). Exports the service so the payroll
 * engine can resolve the period's installment (preview) and record the deduction
 * (persist) idempotently per `(loan_id, period_id)`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeLoan, LoanInstallment]),
    AuthorizationModule,
  ],
  controllers: [PayrollLoansController],
  providers: [PayrollLoansService],
  exports: [PayrollLoansService, TypeOrmModule],
})
export class PayrollLoansModule {}
