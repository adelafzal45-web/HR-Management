import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Leave Balance & Entitlement system schema:
 *
 *   1. `holidays` — company/department holiday calendar, excluded from leave
 *      day counts alongside weekends.
 *   2. `leave_entitlements` — one row per (user, leave_type, year): the
 *      yearly grant HR creates from the Leave Entitlement module. Unique on
 *      the trio so a repeat assignment updates instead of duplicating.
 *   3. `leave_history` — append-only ledger (Entitlement, Adjustment,
 *      Leave Taken, Carry Forward, Expiry) that explains every change to a
 *      balance.
 *   4. `leave_requests` gains `leave_type_id` (FK, nullable for backward
 *      compatibility with the existing free-text `leave_type`), `is_half_day`,
 *      and `days_count` (the working-day count computed and deducted at
 *      approval time).
 *
 * Idempotent throughout — safe to re-run.
 */
export class CreateLeaveEntitlementSystem1788200000000
  implements MigrationInterface
{
  name = 'CreateLeaveEntitlementSystem1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Holidays
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "holidays" (
        "holiday_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(150) NOT NULL,
        "holiday_date" date NOT NULL,
        "description" text,
        "department_id" uuid,
        "is_recurring" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_holidays" PRIMARY KEY ("holiday_id"),
        CONSTRAINT "FK_holidays_department"
          FOREIGN KEY ("department_id") REFERENCES "departments"("department_id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_holidays_date"
        ON "holidays" ("holiday_date")
    `);

    // ------------------------------------------------------------------
    // 2. Leave entitlements (yearly grants)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_entitlements" (
        "leave_entitlement_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "leave_type_id" uuid NOT NULL,
        "year" smallint NOT NULL,
        "entitled_days" numeric(6,2) NOT NULL DEFAULT 0,
        "carried_forward_days" numeric(6,2) NOT NULL DEFAULT 0,
        "adjusted_days" numeric(6,2) NOT NULL DEFAULT 0,
        "expired_days" numeric(6,2) NOT NULL DEFAULT 0,
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_entitlements" PRIMARY KEY ("leave_entitlement_id"),
        CONSTRAINT "UQ_leave_entitlements_user_type_year"
          UNIQUE ("user_id", "leave_type_id", "year"),
        CONSTRAINT "FK_leave_entitlements_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_leave_entitlements_leave_type"
          FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("leave_type_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_leave_entitlements_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("user_id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_entitlements_user"
        ON "leave_entitlements" ("user_id")
    `);

    // ------------------------------------------------------------------
    // 3. Leave history ledger
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_history" (
        "leave_history_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "leave_type_id" uuid NOT NULL,
        "year" smallint NOT NULL,
        "type" character varying(20) NOT NULL,
        "amount" numeric(6,2) NOT NULL,
        "balance_after" numeric(6,2) NOT NULL,
        "note" text,
        "reference_id" uuid,
        "reference_type" character varying(40),
        "performed_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_history" PRIMARY KEY ("leave_history_id"),
        CONSTRAINT "FK_leave_history_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_leave_history_leave_type"
          FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("leave_type_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_leave_history_performed_by"
          FOREIGN KEY ("performed_by") REFERENCES "users"("user_id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_history_user_type_year"
        ON "leave_history" ("user_id", "leave_type_id", "year")
    `);

    // ------------------------------------------------------------------
    // 4. leave_requests: leave_type_id FK, half-day flag, computed days
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ADD COLUMN IF NOT EXISTS "leave_type_id" uuid,
        ADD COLUMN IF NOT EXISTS "is_half_day" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "days_count" numeric(6,2)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_leave_requests_leave_type'
        ) THEN
          ALTER TABLE "leave_requests"
            ADD CONSTRAINT "FK_leave_requests_leave_type"
            FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("leave_type_id")
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP CONSTRAINT IF EXISTS "FK_leave_requests_leave_type",
        DROP COLUMN IF EXISTS "leave_type_id",
        DROP COLUMN IF EXISTS "is_half_day",
        DROP COLUMN IF EXISTS "days_count"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "leave_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_entitlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "holidays"`);
  }
}
