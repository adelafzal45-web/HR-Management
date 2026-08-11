import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayrollSettings } from './payroll-settings.entity';
import { PayrollSettingsController } from './payroll-settings.controller';
import { PayrollSettingsService } from './payroll-settings.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([PayrollSettings]), AuthorizationModule],
  controllers: [PayrollSettingsController],
  providers: [PayrollSettingsService],
  exports: [PayrollSettingsService, TypeOrmModule],
})
export class PayrollSettingsModule {}
