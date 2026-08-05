import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { PasswordHistory } from './password-history.entity';
import {
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
} from '../users/dto/validation.constants';

/**
 * How many former passwords are remembered and refused.
 *
 * Five is the usual compliance floor, and the cost is what caps it: the check is
 * one bcrypt comparison per retained hash at cost 12, so this number is
 * multiplied into the latency of every password change. Older rows are pruned
 * rather than kept forever — retaining hashes indefinitely grows the blast
 * radius of a database leak for no additional security once they can no longer
 * be reused.
 */
export const PASSWORD_HISTORY_DEPTH = 5;

/**
 * Central password rules: strength, and non-reuse against recent history.
 *
 * This exists as a service rather than a DTO validator because the reuse check
 * needs the database, and because all three ways a password can change — a
 * self-service change, an admin reset, and a token redemption — must enforce
 * the identical rules. When that logic lived only in the DTO, the strength rule
 * applied and the history rule did not.
 *
 * Strength itself reuses `PASSWORD_REGEX` / `PASSWORD_MESSAGE` from the users
 * DTO constants rather than restating the pattern, so the message a user sees
 * from a DTO rejection and from this service are the same sentence.
 */
@Injectable()
export class PasswordPolicyService {
  constructor(
    @InjectRepository(PasswordHistory)
    private readonly historyRepository: Repository<PasswordHistory>,
  ) {}

  /**
   * Rejects a password that fails the strength rule.
   *
   * The DTOs already carry `@Matches(PASSWORD_REGEX)`, so in the normal HTTP
   * path this is redundant — deliberately. The reset-redeem and admin-reset
   * paths reach the policy from more than one DTO, and a check that lives only
   * in the DTO is one refactor away from being bypassed.
   */
  assertStrong(password: string): void {
    if (!PASSWORD_REGEX.test(password)) {
      throw new BadRequestException(`Password ${PASSWORD_MESSAGE}`);
    }
  }

  /**
   * Rejects a password matching the current one or any of the last
   * {@link PASSWORD_HISTORY_DEPTH} used.
   *
   * `currentHash` is passed separately because the current password is in
   * `users.password`, not in the history table — history is written only when a
   * password is replaced. Omitting it would let a user "change" their password
   * to the value it already has.
   */
  async assertNotReused(
    userId: string,
    candidate: string,
    currentHash?: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(PasswordHistory)
      : this.historyRepository;

    if (currentHash && (await this.matches(candidate, currentHash))) {
      throw new BadRequestException(
        'The new password must be different from your current password',
      );
    }

    const previous = await repository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: PASSWORD_HISTORY_DEPTH,
    });

    for (const entry of previous) {
      if (await this.matches(candidate, entry.password_hash)) {
        throw new BadRequestException(
          `The new password must not be one of your last ${PASSWORD_HISTORY_DEPTH} passwords`,
        );
      }
    }
  }

  /** `assertStrong` + `assertNotReused`, which is what every caller wants. */
  async assertAcceptable(
    userId: string,
    candidate: string,
    currentHash?: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    this.assertStrong(candidate);
    await this.assertNotReused(userId, candidate, currentHash, manager);
  }

  /**
   * Records a hash as former, then prunes beyond the retained depth.
   *
   * Call this with the hash being *replaced*, not the new one, and inside the
   * same transaction as the password write where one exists — history that can
   * diverge from `users.password` would either refuse a password the user never
   * had or accept one they did.
   */
  async remember(
    userId: string,
    replacedHash: string | null | undefined,
    manager?: EntityManager,
  ): Promise<void> {
    if (!replacedHash) {
      return;
    }

    const repository = manager
      ? manager.getRepository(PasswordHistory)
      : this.historyRepository;

    await repository.save(
      repository.create({ user_id: userId, password_hash: replacedHash }),
    );

    await this.prune(userId, repository);
  }

  /**
   * Deletes history beyond the retained depth.
   *
   * Expressed as "delete the ids not in the newest N" rather than a bare
   * `OFFSET` delete, because Postgres does not accept LIMIT/OFFSET in DELETE.
   */
  private async prune(
    userId: string,
    repository: Repository<PasswordHistory>,
  ): Promise<void> {
    const keep = await repository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: PASSWORD_HISTORY_DEPTH,
      select: { password_history_id: true },
    });

    await repository
      .createQueryBuilder()
      .delete()
      .from(PasswordHistory)
      .where('user_id = :userId', { userId })
      .andWhere(
        keep.length > 0 ? 'password_history_id NOT IN (:...keep)' : '1 = 1',
        keep.length > 0
          ? { keep: keep.map((row) => row.password_history_id) }
          : {},
      )
      .execute();
  }

  /**
   * Compares a candidate against a stored value.
   *
   * Tolerates a legacy plaintext value for the same reason `AuthService` and
   * `changeOwnPassword` do: rows seeded before hashing was introduced still
   * carry one, and a `bcrypt.compare` against a non-hash returns false rather
   * than throwing — which would silently skip the reuse check for exactly the
   * accounts most likely to be reusing a weak password.
   */
  private async matches(candidate: string, stored: string): Promise<boolean> {
    if (!stored) {
      return false;
    }

    return stored.startsWith('$2')
      ? bcrypt.compare(candidate, stored)
      : stored === candidate;
  }
}
