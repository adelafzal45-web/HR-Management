import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'crypto';

import { RefreshToken } from './refresh-token.entity';
import { User } from '../users/user.entity';
import {
  JWT_REFRESH_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  REFRESH_TOKEN_TTL_MS,
  type RefreshTokenClaims,
} from './auth.constants';

/**
 * Issues, validates, rotates, and revokes refresh tokens.
 *
 * Every check runs against the database, not just the signature: a valid
 * signature only proves we minted the token, while the stored row is what can
 * say whether it has since been logged out or rotated away.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * SHA-256 of the raw token. A fast digest is deliberate here: the token is
   * server-generated entropy inside a signed JWT, not a guessable human
   * secret, so there is no offline-guessing threat for a slow KDF to blunt.
   */
  private hash(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /** Mints a refresh token and records its hash so it can be revoked later. */
  async issue(user: User): Promise<string> {
    const jti = crypto.randomUUID();

    const token = await this.jwtService.signAsync(
      { sub: user.user_id, jti },
      { secret: JWT_REFRESH_SECRET, expiresIn: JWT_REFRESH_EXPIRES_IN },
    );

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        refresh_token_id: jti,
        user,
        token_hash: this.hash(token),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      }),
    );

    return token;
  }

  /**
   * Verifies a refresh token and swaps it for a fresh one.
   *
   * Rotation makes each token single-use. If one that was already rotated away
   * comes back, the likeliest explanation is that it leaked and is being
   * replayed, so every token for that user is revoked and they have to log in
   * again — standard reuse detection, and it bounds the damage from a stolen
   * cookie to a single refresh cycle.
   */
  async rotate(rawToken: string): Promise<{ token: string; user: User }> {
    let claims: RefreshTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<RefreshTokenClaims>(rawToken, {
        secret: JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const record = await this.refreshTokenRepository.findOne({
      where: { token_hash: this.hash(rawToken) },
      relations: { user: { role: true, designation: true } },
    });

    if (!record) {
      throw new UnauthorizedException('Refresh token is not recognised');
    }

    if (record.revoked_at) {
      await this.revokeAllForUser(claims.sub);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (record.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    record.revoked_at = new Date();
    await this.refreshTokenRepository.save(record);

    const token = await this.issue(record.user);
    return { token, user: record.user };
  }

  /**
   * Revokes a single token. Used by logout, and intentionally quiet about an
   * unrecognised token — logging out with a stale cookie is not an error worth
   * surfacing to the caller.
   */
  async revoke(rawToken: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { token_hash: this.hash(rawToken), revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  }

  /** Revokes every live token for one user (reuse detection, forced logout). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revoked_at: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }
}
