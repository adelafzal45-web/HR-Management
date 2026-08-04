import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Server-side storage for refresh tokens, so they can be revoked.
 *
 * A refresh token that were only a signed JWT could not be invalidated before
 * its 7-day expiry — logout would be cosmetic, and a stolen token would stay
 * usable for a week. Persisting a hash lets /auth/refresh check the token
 * against live state (not expired, not revoked) on every use.
 *
 * Only the SHA-256 digest is stored; the raw token exists only in the client's
 * httpOnly cookie.
 */
export class CreateRefreshTokens1786100000000 implements MigrationInterface {
  name = 'CreateRefreshTokens1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "refresh_token_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("refresh_token_id"),
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);

    // Deleting a user must not leave orphaned credentials behind.
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD CONSTRAINT "FK_refresh_tokens_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Lookup on every /auth/refresh call is by hash.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_token_hash"
      ON "refresh_tokens" ("token_hash")
    `);

    // Supports revoking a user's whole session set on logout-everywhere.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_user_id"
      ON "refresh_tokens" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_token_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_refresh_tokens_user"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
