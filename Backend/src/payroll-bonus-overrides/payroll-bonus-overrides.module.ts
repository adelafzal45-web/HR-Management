import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayrollBonusOverride } from './payroll-bonus-overrides.entity';
import { PayrollBonusOverridesController } from './payroll-bonus-overrides.controller';
import { PayrollBonusOverridesService } from './payroll-bonus-overrides.service';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Manual per-(employee, period) bonus overrides for a payroll run.
 *
 * Owns the `payroll_bonus_overrides` table and its CRUD surface. The engine
 * reads these rows through its own repository (registered in PayrollEngineModule's
 * forFeature), so this module only needs the guard from AuthorizationModule
 * behind the reused payroll.preview / payroll.process permissions.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PayrollBonusOverride]),
    AuthorizationModule,
  ],
  controllers: [PayrollBonusOverridesController],
  providers: [PayrollBonusOverridesService],
  exports: [PayrollBonusOverridesService],
})
export class PayrollBonusOverridesModule {}
