import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `leave_types` catalog and canonicalises the free-text values
 * already stored on `leave_requests`.
 *
 * Root cause of the "Couldn't load leave types." error: unlike Designations and
 * Shifts (which were 403s), this endpoint genuinely did not exist — there was no
 * table, entity, or controller anywhere in the backend. `leave_requests.leave_type`
 * is a free-text varchar(30), so leave types were never modelled as data.
 *
 * Because nothing constrained that column, the same concept was stored under two
 * spellings — e.g. 'Annual' (8 rows) alongside 'Annual Leave' (4 rows). Step 3
 * folds the short forms onto the canonical catalog names so the Settings screen
 * shows one entry per leave type instead of two. Step 4 then adopts anything
 * still unrecognised, so no historical request points at a type the UI can't show.
 *
 * No foreign key is added from `leave_requests.leave_type` yet — that is a
 * separate change and would need the column retyped to uuid.
 */
export class CreateLeaveTypes1786300000000 implements MigrationInterface {
  name = 'CreateLeaveTypes1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Catalog table
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_types" (
        "leave_type_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "description" text,
        "is_paid" boolean NOT NULL DEFAULT true,
        "max_days_per_year" integer NOT NULL DEFAULT 0,
        "carry_forward_allowed" boolean NOT NULL DEFAULT false,
        "max_carry_forward_days" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_types" PRIMARY KEY ("leave_type_id"),
        CONSTRAINT "UQ_leave_types_name" UNIQUE ("name"),
        CONSTRAINT "CHK_leave_types_max_days" CHECK ("max_days_per_year" >= 0),
        CONSTRAINT "CHK_leave_types_carry_forward_days"
          CHECK ("max_carry_forward_days" >= 0),
        CONSTRAINT "CHK_leave_types_carry_forward_consistency"
          CHECK ("carry_forward_allowed" OR "max_carry_forward_days" = 0)
      )
    `);

    // ------------------------------------------------------------------
    // 2. Standard catalog. ON CONFLICT keeps this idempotent and avoids
    //    clobbering values an administrator may already have tuned.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "leave_types"
        ("name", "description", "is_paid", "max_days_per_year",
         "carry_forward_allowed", "max_carry_forward_days")
      VALUES
        ('Annual Leave', 'Paid annual vacation entitlement', true, 20, true, 5),
        ('Sick Leave', 'Paid leave for illness or medical appointments', true, 10, false, 0),
        ('Casual Leave', 'Short-notice paid leave for personal matters', true, 10, false, 0),
        ('Maternity Leave', 'Paid leave for childbirth and recovery', true, 90, false, 0),
        ('Paternity Leave', 'Paid leave following the birth of a child', true, 14, false, 0),
        ('Bereavement Leave', 'Paid leave following the death of a family member', true, 5, false, 0),
        ('Unpaid Leave', 'Approved absence without pay', false, 0, false, 0)
      ON CONFLICT ("name") DO NOTHING
    `);

    // ------------------------------------------------------------------
    // 3. Canonicalise existing requests: 'Annual' -> 'Annual Leave', etc.
    //
    //    Only rewrites a value when appending ' Leave' lands exactly on a
    //    catalog name, so unrelated values are left untouched. This changes
    //    stored text but not meaning — both spellings referred to the same
    //    leave type.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      UPDATE "leave_requests" lr
      SET "leave_type" = lt."name"
      FROM "leave_types" lt
      WHERE lt."name" = btrim(lr."leave_type") || ' Leave'
    `);

    // ------------------------------------------------------------------
    // 4. Adopt anything still unrecognised so the catalog covers every value
    //    actually in use.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "leave_types" ("name", "description", "is_paid", "max_days_per_year")
      SELECT DISTINCT btrim(lr."leave_type"),
             'Imported from existing leave requests',
             true,
             0
      FROM "leave_requests" lr
      WHERE lr."leave_type" IS NOT NULL
        AND btrim(lr."leave_type") <> ''
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_types_is_active"
        ON "leave_types" ("is_active")
    `);
  }

  /**
   * Drops the catalog. The step-3 canonicalisation is NOT reversed: the original
   * spellings were not recorded, and reversing by stripping ' Leave' would also
   * corrupt rows that legitimately read 'Annual Leave' before this ran. The
   * column is free text either way, so the normalised values remain valid.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leave_types_is_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_types"`);
  }
}
