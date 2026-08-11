import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayrollPeriod } from './payroll-periods.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { Payslip } from '../payslips/payslips.entity';
import { SalaryComponent } from '../salary-components/salary-components.entity';
import {
  SalaryStructure,
  SalaryStructureAssignment,
} from '../salary-structures/salary-structures.entity';
import { PayrollPeriodsService } from './payroll-periods.service';
import { PayrollPeriodsController } from './payroll-periods.controller';
import { PayrollEngineModule } from '../payroll-engine/payroll-engine.module';
import { PayrollTaxModule } from '../payroll-tax/payroll-tax.module';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Payroll periods and the run/approve/lock workflow (spec §1). Pulls in the
 * PayrollEngineModule for `PayrollCalculationService` (payslip generation) and
 * AuthorizationModule for the permission guard. The component/structure repos
 * back the setup-status hard gate that guards processing; PayrollTaxModule
 * surfaces the (optional) active tax config in that same checklist.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollPeriod,
      PayrollSettings,
      Payslip,
      SalaryComponent,
      SalaryStructure,
      SalaryStructureAssignment,
    ]),
    PayrollEngineModule,
    PayrollTaxModule,
    AuthorizationModule,
  ],
  controllers: [PayrollPeriodsController],
  providers: [PayrollPeriodsService],
  exports: [PayrollPeriodsService, TypeOrmModule],
})
export class PayrollPeriodsModule {}
