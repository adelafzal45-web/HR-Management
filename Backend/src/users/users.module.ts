import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user.entity';
import { UserLeaveBalance } from './user-leave-balance.entity';
import { Role } from '../roles/roles.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

import { UserController } from './users.controller';
import { UserService } from './users.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { PasswordPolicyModule } from '../auth/password-policy.module';
import { MailModule } from '../mail/mail.module';
import { EmployeeFieldSettingsModule } from '../employee-field-settings/employee-field-settings.module';

@Module({
  imports: [
    // Role and LeaveType are registered read-only here: UserService needs to
    // validate assignable roles and leave-type ids without depending on those
    // modules' services, which would create an import cycle.
    TypeOrmModule.forFeature([User, UserLeaveBalance, Role, LeaveType]),
    AuthorizationModule,
    AuditModule,
    // The strength + reuse rules, so the self-service change and the admin reset
    // enforce exactly what the token-redeem path in AuthModule enforces. A leaf
    // module rather than AuthModule itself, which imports this one.
    PasswordPolicyModule,
    // Account lifecycle notifications (created, activated, deactivated, profile
    // updated). Enqueued, never sent inline — see MailService.
    MailModule,
    // Requiredness config (single-row). UserService injects its service to
    // reject a blank value for any field HR has marked required on create,
    // admin update, and self-service profile edit. Acyclic: this module only
    // depends on its own entity + AuthorizationModule.
    EmployeeFieldSettingsModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
