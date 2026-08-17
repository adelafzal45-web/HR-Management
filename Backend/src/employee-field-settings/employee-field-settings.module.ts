import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmployeeFieldSettings } from './employee-field-settings.entity';
import { EmployeeFieldSettingsController } from './employee-field-settings.controller';
import { EmployeeFieldSettingsService } from './employee-field-settings.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeFieldSettings]),
    AuthorizationModule,
  ],
  controllers: [EmployeeFieldSettingsController],
  providers: [EmployeeFieldSettingsService],
  // Exported so UsersModule can inject the service for create/update enforcement.
  exports: [EmployeeFieldSettingsService, TypeOrmModule],
})
export class EmployeeFieldSettingsModule {}
