import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Payslip, PayslipLine } from './payslips.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { PayslipsService } from './payslips.service';
import { PayslipsController } from './payslips.controller';
import { PayrollEngineModule } from '../payroll-engine/payroll-engine.module';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Payslip reads + preview (spec §14). Owns the `payslips`/`payslip_lines`
 * entities; delegates the actual computation to PayrollEngineModule's
 * `PayrollCalculationService`. PayrollSettings is registered here so the
 * self-service gate (`employee_self_service`) can be checked on `/payslips/me`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Payslip, PayslipLine, PayrollSettings]),
    PayrollEngineModule,
    AuthorizationModule,
  ],
  controllers: [PayslipsController],
  providers: [PayslipsService],
  exports: [PayslipsService, TypeOrmModule],
})
export class PayslipsModule {}
