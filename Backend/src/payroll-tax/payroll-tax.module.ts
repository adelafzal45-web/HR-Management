import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TaxConfig, TaxSlab } from './payroll-tax.entity';
import { PayrollTaxController } from './payroll-tax.controller';
import { PayrollTaxService } from './payroll-tax.service';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Income tax configuration (spec §10). Exports the service so the payroll
 * engine can resolve the active config and compute a period's tax.
 * PayrollSettings is imported read-only for the pay-period frequency the
 * annualization uses.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TaxConfig, TaxSlab, PayrollSettings]),
    AuthorizationModule,
  ],
  controllers: [PayrollTaxController],
  providers: [PayrollTaxService],
  exports: [PayrollTaxService, TypeOrmModule],
})
export class PayrollTaxModule {}
