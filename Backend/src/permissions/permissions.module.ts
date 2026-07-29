import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Permission } from './permission.entity';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { AuthorizationModule } from '../authorization/authorization.module';
@Module({
  imports: [TypeOrmModule.forFeature([Permission]), AuthorizationModule],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService, TypeOrmModule],
})
export class PermissionsModule {}
