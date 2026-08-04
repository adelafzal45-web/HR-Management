import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PasswordHistory } from './password-history.entity';
import { PasswordPolicyService } from './password-policy.service';

/**
 * The password rules, in a module of their own.
 *
 * Separated from `AuthModule` purely to break a cycle. Three code paths change a
 * password — the reset redemption in `AuthModule`, and the self-service change
 * and admin reset in `UserModule` — and all three must enforce the identical
 * strength and reuse rules. `AuthModule` already imports `UserModule` (for
 * `changeOwnPassword`), so `UserModule` cannot import `AuthModule` back.
 *
 * A leaf module both can depend on is the fix, and it is preferable to
 * `forwardRef`: the dependency really is one-directional, it just needed to
 * point at something smaller than the whole of `AuthModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PasswordHistory])],
  providers: [PasswordPolicyService],
  exports: [PasswordPolicyService],
})
export class PasswordPolicyModule {}
