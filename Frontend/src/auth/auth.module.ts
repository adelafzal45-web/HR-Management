import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordResetAdminController } from './password-reset-admin.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken } from './refresh-token.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { PasswordResetService } from './password-reset.service';
import { PasswordPolicyModule } from './password-policy.module';
import { JWT_EXPIRES_IN, JWT_SECRET } from './auth.constants';
import { User } from '../users/user.entity';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { UserModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, PasswordResetToken]),
    // Login returns the caller's live permission set, resolved through
    // AuthorizationService so there is one source of truth for role → grants.
    AuthorizationModule,
    // Strength and reuse rules, shared with UserModule's two password paths.
    PasswordPolicyModule,
    // The reset trail (issued / redeemed / blocked) goes to the same audit log
    // as every other employee-record mutation.
    AuditModule,
    // Reset links and confirmations are queued, not sent inline — a mail server
    // outage must not fail a password reset.
    MailModule,
    // POST /auth/change-password delegates to UserService.changeOwnPassword
    // rather than reimplementing the current-password check. Not a cycle:
    // UserModule does not import AuthModule.
    UserModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: JWT_EXPIRES_IN },
    }),
  ],
  controllers: [AuthController, PasswordResetAdminController],
  providers: [
    AuthService,
    RefreshTokenService,
    PasswordResetService,
    // Global authentication — verifies the Bearer token on every request
    // except those marked @Public(). Runs before the per-route PermissionGuard.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  // PasswordResetService is exported for the admin bulk-reset endpoint on
  // UserController. PasswordPolicyService is re-exported via
  // PasswordPolicyModule rather than listed here, so there is one owner of it.
  exports: [AuthService, RefreshTokenService, PasswordResetService],
})
export class AuthModule {}
