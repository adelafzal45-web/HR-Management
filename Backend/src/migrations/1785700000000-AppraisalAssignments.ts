import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-form assignment support.
 *
 * 1. `appraisal_form_assignments` — assigns a form to a department, a
 *    designation, or a single employee. Exactly one target per row, enforced by
 *    a CHECK constraint.
 * 2. `appraisal_form_questions.rating_scale` / `min_label` / `max_label` — the
 *    per-question rating scale HR configures in the form builder.
 * 3. Backfills assignments from the legacy single `department_id` /
 *    `designation_id` columns on `appraisal_forms`, so forms configured before
 *    this migration keep resolving to the same audience.
 *
 * Idempotent: safe to re-run.
 */
export class AppraisalAssignments1785700000000 implements MigrationInterface {
  name = 'AppraisalAssignments1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Assignments table
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisal_form_assignments" (
        "assignment_id"  uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id"        uuid NOT NULL,
        "department_id"  uuid,
        "designation_id" uuid,
        "user_id"        uuid,
        "created_at"     TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appraisal_form_assignments"
          PRIMARY KEY ("assignment_id"),
        CONSTRAINT "FK_afa_form" FOREIGN KEY ("form_id")
          REFERENCES "appraisal_forms"("form_id") ON DELETE CASCADE,
        CONSTRAINT "FK_afa_department" FOREIGN KEY ("department_id")
          REFERENCES "departments"("department_id") ON DELETE CASCADE,
        CONSTRAINT "FK_afa_designation" FOREIGN KEY ("designation_id")
          REFERENCES "designations"("designation_id") ON DELETE CASCADE,
        CONSTRAINT "FK_afa_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("user_id") ON DELETE CASCADE,
        -- Exactly one target must be set.
        CONSTRAINT "CHK_afa_single_target" CHECK (
          (("department_id" IS NOT NULL)::int
           + ("designation_id" IS NOT NULL)::int
           + ("user_id" IS NOT NULL)::int) = 1
        )
      );
    `);

    // Prevent the same form being assigned twice to the same target.
    // Partial unique indexes, because NULLs don't compare equal in a plain one.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_afa_form_department"
        ON "appraisal_form_assignments" ("form_id", "department_id")
        WHERE "department_id" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_afa_form_designation"
        ON "appraisal_form_assignments" ("form_id", "designation_id")
        WHERE "designation_id" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_afa_form_user"
        ON "appraisal_form_assignments" ("form_id", "user_id")
        WHERE "user_id" IS NOT NULL;
    `);

    // Resolution reads by target, so index each one.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_afa_department"
        ON "appraisal_form_assignments" ("department_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_afa_designation"
        ON "appraisal_form_assignments" ("designation_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_afa_user"
        ON "appraisal_form_assignments" ("user_id");
    `);

    // ------------------------------------------------------------------
    // 2. Per-question rating scale
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        ADD COLUMN IF NOT EXISTS "rating_scale" integer NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS "min_label" character varying(60),
        ADD COLUMN IF NOT EXISTS "max_label" character varying(60);
    `);

    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP CONSTRAINT IF EXISTS "CHK_afq_rating_scale";
    `);
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        ADD CONSTRAINT "CHK_afq_rating_scale"
        CHECK ("rating_scale" BETWEEN 2 AND 100);
    `);

    // ------------------------------------------------------------------
    // 3. Backfill from the legacy single-target columns on appraisal_forms
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "appraisal_form_assignments" ("form_id", "department_id")
      SELECT f."form_id", f."department_id"
      FROM "appraisal_forms" f
      WHERE f."department_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "appraisal_form_assignments" a
          WHERE a."form_id" = f."form_id"
            AND a."department_id" = f."department_id"
        );
    `);
    await queryRunner.query(`
      INSERT INTO "appraisal_form_assignments" ("form_id", "designation_id")
      SELECT f."form_id", f."designation_id"
      FROM "appraisal_forms" f
      WHERE f."designation_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "appraisal_form_assignments" a
          WHERE a."form_id" = f."form_id"
            AND a."designation_id" = f."designation_id"
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appraisal_form_questions" DROP CONSTRAINT IF EXISTS "CHK_afq_rating_scale"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP COLUMN IF EXISTS "max_label",
        DROP COLUMN IF EXISTS "min_label",
        DROP COLUMN IF EXISTS "rating_scale";
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "appraisal_form_assignments"`,
    );
  }
}
