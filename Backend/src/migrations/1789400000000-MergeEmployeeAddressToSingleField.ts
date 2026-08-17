import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapses the structured address (street_address, city, state_province,
 * postal_code, country) back into the single free-text `address` column, then
 * drops the five structured columns.
 *
 * Data-safe by construction: the backfill runs BEFORE the drop and only touches
 * rows whose `address` is still empty, composing it from whatever structured
 * parts are present (blanks skipped). Rows that already carry a legacy `address`
 * are left untouched — an earlier migration (EmployeeManagementSchema) copied
 * `address` into `street_address`, so re-deriving those would only echo what is
 * already there. No employee address is lost.
 *
 * Irreversible in the strict sense: `down()` re-adds the five columns so the
 * schema matches again, but it cannot split the merged free-text back into
 * parts — the authoritative value now lives in `address`.
 *
 * Idempotent: the column drops use IF EXISTS and the backfill is guarded on an
 * empty `address`, so a re-run changes nothing.
 */
export class MergeEmployeeAddressToSingleField1789400000000
  implements MigrationInterface
{
  name = 'MergeEmployeeAddressToSingleField1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Backfill `address` from the structured parts, for rows that have
    //    no free-text address yet. NULLIF(btrim(...), '') turns a blank into
    //    NULL so concat_ws skips it; the WHERE guard ensures at least one part
    //    is present, so the composed value is never an empty string.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      UPDATE "users"
      SET "address" = concat_ws(', ',
        NULLIF(btrim("street_address"), ''),
        NULLIF(btrim("city"), ''),
        NULLIF(btrim("state_province"), ''),
        NULLIF(btrim("postal_code"), ''),
        NULLIF(btrim("country"), '')
      )
      WHERE ("address" IS NULL OR btrim("address") = '')
        AND (
          NULLIF(btrim("street_address"), '') IS NOT NULL OR
          NULLIF(btrim("city"), '') IS NOT NULL OR
          NULLIF(btrim("state_province"), '') IS NOT NULL OR
          NULLIF(btrim("postal_code"), '') IS NOT NULL OR
          NULLIF(btrim("country"), '') IS NOT NULL
        )
    `);

    // ------------------------------------------------------------------
    // 2. Drop the structured columns. `address` (text, nullable) stays as the
    //    single source of truth.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "street_address",
        DROP COLUMN IF EXISTS "city",
        DROP COLUMN IF EXISTS "state_province",
        DROP COLUMN IF EXISTS "postal_code",
        DROP COLUMN IF EXISTS "country"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the columns (same types as EmployeeManagementSchema created them)
    // so the schema round-trips. The split values cannot be recovered — the
    // merged text remains in `address` — so these come back empty.
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "street_address" text,
        ADD COLUMN IF NOT EXISTS "city" character varying(100),
        ADD COLUMN IF NOT EXISTS "state_province" character varying(100),
        ADD COLUMN IF NOT EXISTS "postal_code" character varying(20),
        ADD COLUMN IF NOT EXISTS "country" character varying(100)
    `);

    // Mirror the original migration's backfill: seed street_address from the
    // free-text address so the structured form has something to show again.
    await queryRunner.query(`
      UPDATE "users"
      SET "street_address" = "address"
      WHERE "street_address" IS NULL
        AND "address" IS NOT NULL
        AND btrim("address") <> ''
    `);
  }
}
