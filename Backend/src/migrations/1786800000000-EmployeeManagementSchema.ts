import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema for the Employee Management module.
 *
 * Four separate concerns, kept in one migration because they are introduced
 * together and a partial apply would leave the module non-functional:
 *
 *   1. Normalised address + emergency contact + bank/payroll columns on `users`.
 *   2. The Team Lead hierarchy (`users.team_lead_id`, a self-referencing FK).
 *   3. Per-employee leave entitlement (`user_leave_balances`).
 *   4. `audit_logs`, for the mutation trail the module is required to keep.
 *
 * ---------------------------------------------------------------------------
 * On the address columns
 * ---------------------------------------------------------------------------
 * `users.address` is an existing free-text column. It is NOT dropped here.
 * The new structured columns are added alongside it and backfilled by copying
 * the old value into `street_address`, because a free-text address cannot be
 * reliably parsed into city/state/postal/country — guessing would silently
 * corrupt real records. The legacy column is left in place so nothing that
 * still reads it breaks; it can be dropped in a later migration once every
 * reader has moved over.
 *
 * ---------------------------------------------------------------------------
 * On the account flags
 * ---------------------------------------------------------------------------
 * Only genuine *account state* lives here. Module access (payroll, leave,
 * appraisal, reports…) is deliberately NOT duplicated as boolean columns —
 * that is already modelled by the RBAC role/permission graph, and a second
 * copy would inevitably disagree with the first. These flags answer "can this
 * account authenticate, and through which channel", which RBAC does not cover.
 *
 * All flags default to the permissive value that matches today's behaviour, so
 * existing users are unaffected by the migration.
 *
 * ---------------------------------------------------------------------------
 * On team_lead_id
 * ---------------------------------------------------------------------------
 * Self-referencing FK: Department -> many Team Leads -> many members. The FK
 * alone cannot express "the lead must be in the same department as the member"
 * (SQL has no cross-row CHECK), so that invariant is enforced in the service
 * layer on write. ON DELETE SET NULL: deleting a lead orphans their reports
 * rather than cascading a delete through real employee records.
 *
 * Idempotent throughout — safe to re-run.
 */
export class EmployeeManagementSchema1786800000000
  implements MigrationInterface
{
  name = 'EmployeeManagementSchema1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Structured address, emergency contact, bank details, blood group.
    //
    //    Every column is nullable: this migration must not fail on a table
    //    that already has rows, and NOT NULL without a default would. The
    //    "required" fields from the spec are enforced by the DTO layer for
    //    new records; backfilling historical rows is a data task, not a
    //    schema one.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "street_address" text,
        ADD COLUMN IF NOT EXISTS "city" character varying(100),
        ADD COLUMN IF NOT EXISTS "state_province" character varying(100),
        ADD COLUMN IF NOT EXISTS "postal_code" character varying(20),
        ADD COLUMN IF NOT EXISTS "country" character varying(100),
        ADD COLUMN IF NOT EXISTS "emergency_contact_name" character varying(150),
        ADD COLUMN IF NOT EXISTS "emergency_contact_relationship" character varying(60),
        ADD COLUMN IF NOT EXISTS "emergency_contact_phone" character varying(20),
        ADD COLUMN IF NOT EXISTS "bank_name" character varying(150),
        ADD COLUMN IF NOT EXISTS "bank_account_number" character varying(40),
        ADD COLUMN IF NOT EXISTS "bank_routing_code" character varying(20),
        ADD COLUMN IF NOT EXISTS "blood_group" character varying(5)
    `);

    // Backfill: preserve whatever is in the legacy free-text column rather
    // than attempting to parse it into parts. Only touches rows where the
    // new column is still empty, so re-running never clobbers edited data.
    await queryRunner.query(`
      UPDATE "users"
      SET "street_address" = "address"
      WHERE "street_address" IS NULL
        AND "address" IS NOT NULL
        AND btrim("address") <> ''
    `);

    // ------------------------------------------------------------------
    // 2. Account-state flags.
    //
    //    Defaults chosen so that applying this migration changes nothing
    //    about how any existing account behaves.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "login_enabled" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "password_reset_allowed" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "web_login_allowed" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "mobile_login_allowed" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "api_access_allowed" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "multi_device_login_allowed" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "remote_attendance_allowed" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "biometric_attendance_allowed" boolean NOT NULL DEFAULT false
    `);

    // ------------------------------------------------------------------
    // 3. Team Lead hierarchy.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "team_lead_id" uuid
    `);

    // Guard the FK with a catalog check — ADD CONSTRAINT has no IF NOT EXISTS.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_users_team_lead'
        ) THEN
          ALTER TABLE "users"
            ADD CONSTRAINT "FK_users_team_lead"
            FOREIGN KEY ("team_lead_id") REFERENCES "users"("user_id")
            ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    // An employee cannot report to themselves. This one IS expressible as a
    // single-row CHECK, unlike the same-department rule.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_users_team_lead_not_self'
        ) THEN
          ALTER TABLE "users"
            ADD CONSTRAINT "CHK_users_team_lead_not_self"
            CHECK ("team_lead_id" IS NULL OR "team_lead_id" <> "user_id");
        END IF;
      END
      $$;
    `);

    // Drives "list my team" and the department-grouped Team Leads tab.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_team_lead"
        ON "users" ("team_lead_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_department"
        ON "users" ("department_id")
    `);

    // ------------------------------------------------------------------
    // 4. Per-employee leave entitlement.
    //
    //    An employee may be granted several leave types, each with its own
    //    allocation and running usage. `remaining` is deliberately NOT a
    //    stored column — it is derived (allocated - used) so the two can
    //    never drift out of sync.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_leave_balances" (
        "user_leave_balance_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "leave_type_id" uuid NOT NULL,
        "allocated_days" numeric(6,2) NOT NULL DEFAULT 0,
        "used_days" numeric(6,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_leave_balances" PRIMARY KEY ("user_leave_balance_id"),
        CONSTRAINT "UQ_user_leave_balances_user_type"
          UNIQUE ("user_id", "leave_type_id"),
        CONSTRAINT "CHK_user_leave_balances_allocated"
          CHECK ("allocated_days" >= 0),
        CONSTRAINT "CHK_user_leave_balances_used"
          CHECK ("used_days" >= 0),
        CONSTRAINT "FK_user_leave_balances_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_user_leave_balances_leave_type"
          FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("leave_type_id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_leave_balances_user"
        ON "user_leave_balances" ("user_id")
    `);

    // ------------------------------------------------------------------
    // 5. Audit trail.
    //
    //    `actor_user_id` is ON DELETE SET NULL, not CASCADE: deleting a user
    //    must never erase the record of what they did. `actor_email` keeps a
    //    human-readable trace even after the account is gone.
    //
    //    before/after are jsonb so a diff can be inspected without a schema
    //    change per audited entity.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "audit_log_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actor_user_id" uuid,
        "actor_email" character varying(255),
        "action" character varying(80) NOT NULL,
        "entity_type" character varying(80) NOT NULL,
        "entity_id" character varying(100),
        "before_state" jsonb,
        "after_state" jsonb,
        "ip_address" character varying(64),
        "user_agent" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("audit_log_id"),
        CONSTRAINT "FK_audit_logs_actor"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity"
        ON "audit_logs" ("entity_type", "entity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at"
        ON "audit_logs" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_leave_balances"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_department"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_team_lead"`);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "CHK_users_team_lead_not_self"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_team_lead"
    `);

    // The legacy `address` column was never dropped in up(), so there is
    // nothing to restore here — dropping the structured columns is enough.
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "team_lead_id",
        DROP COLUMN IF EXISTS "biometric_attendance_allowed",
        DROP COLUMN IF EXISTS "remote_attendance_allowed",
        DROP COLUMN IF EXISTS "multi_device_login_allowed",
        DROP COLUMN IF EXISTS "api_access_allowed",
        DROP COLUMN IF EXISTS "mobile_login_allowed",
        DROP COLUMN IF EXISTS "web_login_allowed",
        DROP COLUMN IF EXISTS "password_reset_allowed",
        DROP COLUMN IF EXISTS "login_enabled",
        DROP COLUMN IF EXISTS "blood_group",
        DROP COLUMN IF EXISTS "bank_routing_code",
        DROP COLUMN IF EXISTS "bank_account_number",
        DROP COLUMN IF EXISTS "bank_name",
        DROP COLUMN IF EXISTS "emergency_contact_phone",
        DROP COLUMN IF EXISTS "emergency_contact_relationship",
        DROP COLUMN IF EXISTS "emergency_contact_name",
        DROP COLUMN IF EXISTS "country",
        DROP COLUMN IF EXISTS "postal_code",
        DROP COLUMN IF EXISTS "state_province",
        DROP COLUMN IF EXISTS "city",
        DROP COLUMN IF EXISTS "street_address"
    `);
  }
}
