import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthorizationService } from './authorization.service';
import { PermissionGuard } from './guards/permission.guard';

import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
    ]),
  ],

  providers: [
    AuthorizationService,
    PermissionGuard,
  ],

  exports: [
    AuthorizationService,
    PermissionGuard,
  ],
})
export class AuthorizationModule {}