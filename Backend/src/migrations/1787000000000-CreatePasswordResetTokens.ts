import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Password-recovery infrastructure.
 *
 * Three things land together because they are one feature:
 *
 *   - `password_reset_tokens` — single-use, expiring, hashed reset tokens.
 *   - `password_history` — previous hashes, so a "new" password can be rejected
 *     for being one the user already used.
 *   - `users.profile_image_thumb` — the thumbnail path written alongside a photo
 *     upload. Included here rather than in its own migration because both are
 *     part of the same delivery and a second migration for one nullable column
 *     is noise.
 *
 * The token table deliberately mirrors `refresh_tokens` (see
 * RefreshToken entity): store only a SHA-256 digest, keep rows after use rather
 * than deleting them, and record expiry in the row instead of trusting a signed
 * payload. A replayed token is then recognisable as *used* rather than merely
 * unknown, which is the difference between "this link was already consumed" and
 * a silent failure.
 */
export class CreatePasswordResetTokens1787000000000
  implements MigrationInterface
{
  name = 'CreatePasswordResetTokens1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "password_reset_token_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "delivery_email" character varying(255) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "invalidated_at" TIMESTAMP WITH TIME ZONE,
        "created_by_user_id" uuid,
        "created_ip" character varying(64),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("password_reset_token_id"),
        CONSTRAINT "UQ_password_reset_tokens_hash" UNIQUE ("token_hash")
      )
    `);

    // ON DELETE CASCADE: a deleted employee's outstanding reset links must die
    // with the account, or a live token would point at a user_id that no longer
    // resolves.
    await queryRunner.query(`
      ALTER TABLE "password_reset_tokens"
      ADD CONSTRAINT "FK_password_reset_tokens_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
      ON DELETE CASCADE
    `);

    // SET NULL, not CASCADE: the record that an admin issued this link must
    // survive that admin being offboarded.
    await queryRunner.query(`
      ALTER TABLE "password_reset_tokens"
      ADD CONSTRAINT "FK_password_reset_tokens_created_by"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_password_reset_tokens_user"
      ON "password_reset_tokens" ("user_id")
    `);

    // The redeem path looks a token up by hash and immediately needs to know
    // whether it is still live; the partial index keeps that to the rows that
    // can actually be redeemed.
    await queryRunner.query(`
      CREATE INDEX "IDX_password_reset_tokens_live"
      ON "password_reset_tokens" ("token_hash")
      WHERE "used_at" IS NULL AND "invalidated_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "password_history" (
        "password_history_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_history" PRIMARY KEY ("password_history_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "password_history"
      ADD CONSTRAINT "FK_password_history_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
      ON DELETE CASCADE
    `);

    // Composite rather than user_id alone: every read is "the N most recent for
    // this user", which this index satisfies without a sort.
    await queryRunner.query(`
      CREATE INDEX "IDX_password_history_user_created"
      ON "password_history" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD "profile_image_thumb" character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "profile_image_thumb"`,
    );
    await queryRunner.query(`DROP TABLE "password_history"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
