import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayrollRule } from './payroll-rules.entity';
import { PayrollRulesController } from './payroll-rules.controller';
import { PayrollRulesService } from './payroll-rules.service';
import { PayrollRuleResolverService } from './payroll-rule-resolver.service';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Payroll rule builder (spec §4–8, §16). Exports the resolver so the payroll
 * engine can pull the active rules for an employee/period, and TypeOrmModule so
 * other modules can inject the repository if needed.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PayrollRule]), AuthorizationModule],
  controllers: [PayrollRulesController],
  providers: [PayrollRulesService, PayrollRuleResolverService],
  exports: [PayrollRulesService, PayrollRuleResolverService, TypeOrmModule],
})
export class PayrollRulesModule {}
