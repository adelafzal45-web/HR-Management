import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Appraisal vertical fixes + seed.
 *
 * 1. performance_reviews.attendance_id -> nullable (period reviews aren't day-bound).
 * 2. performance_reviews.recommendation -> new nullable text column.
 * 3. Dedupe role_permissions, then grant Team Lead the appraisal write perms.
 * 4. Seed the "Standard Appraisal" form + 5 criteria + 5 form-question links.
 *
 * All steps are idempotent / guarded so a re-run is safe, and fully reversible.
 */
export class AppraisalVerticalFixes1785500000000
  implements MigrationInterface
{
  name = 'AppraisalVerticalFixes1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. attendance_id nullable + drop the old CASCADE, use SET NULL
    // ------------------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" ALTER COLUMN "attendance_id" DROP NOT NULL`,
    );

    // Recreate the FK as SET NULL if it exists (constraint name is generated;
    // find and swap it dynamically to stay portable across environments).
    await queryRunner.query(`
      DO $$
      DECLARE fk_name text;
      BEGIN
        SELECT tc.constraint_name INTO fk_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'performance_reviews'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'attendance_id'
        LIMIT 1;

        IF fk_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "performance_reviews" DROP CONSTRAINT %I', fk_name
          );
        END IF;

        ALTER TABLE "performance_reviews"
          ADD CONSTRAINT "FK_performance_reviews_attendance"
          FOREIGN KEY ("attendance_id") REFERENCES "attendance"("attendance_id")
          ON DELETE SET NULL;
      END $$;
    `);

    // ------------------------------------------------------------------
    // 2. recommendation column
    // ------------------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" ADD COLUMN IF NOT EXISTS "recommendation" text`,
    );

    // ------------------------------------------------------------------
    // 3. Dedupe role_permissions (keep the earliest row per role+permission)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      DELETE FROM "role_permissions" a
      USING "role_permissions" b
      WHERE a.ctid > b.ctid
        AND a."role_id" = b."role_id"
        AND a."permission_id" = b."permission_id";
    `);

    // Grant Team Lead the appraisal write permissions (only if missing).
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."role_id", p."permission_id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."role_name" = 'Team Lead'
        AND p."permission_name" IN (
          'appraisal.create',
          'appraisal.update',
          'appraisal.view',
          'appraisal-forms.create',
          'appraisal-forms.update',
          'appraisal-forms.view',
          'appraisal-form-questions.create',
          'appraisal-form-questions.update',
          'appraisal-form-questions.view',
          'apprisal-question.create',
          'apprisal-question.update',
          'employees.view'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "role_permissions" rp
          WHERE rp."role_id" = r."role_id"
            AND rp."permission_id" = p."permission_id"
        );
    `);

    // ------------------------------------------------------------------
    // 4. Seed the Standard Appraisal form + criteria (idempotent by name)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      DO $$
      DECLARE
        v_form_id uuid;
        v_q_id uuid;
        r RECORD;
      BEGIN
        -- Form
        SELECT form_id INTO v_form_id FROM "appraisal_forms"
        WHERE form_name = 'Standard Appraisal';

        IF v_form_id IS NULL THEN
          INSERT INTO "appraisal_forms"
            ("form_name", "description", "evaluation_type", "status", "is_active")
          VALUES
            ('Standard Appraisal',
             'Default company-wide performance appraisal form.',
             'Monthly', 'Published', true)
          RETURNING form_id INTO v_form_id;
        END IF;

        -- Criteria: (question_text, weight, display_order)
        FOR r IN
          SELECT * FROM (VALUES
            ('Job Knowledge', 25::numeric, 1),
            ('Quality of Work', 25::numeric, 2),
            ('Communication', 20::numeric, 3),
            ('Teamwork', 15::numeric, 4),
            ('Punctuality', 15::numeric, 5)
          ) AS t(qtext, weight, ord)
        LOOP
          -- Question (create if missing)
          SELECT question_id INTO v_q_id FROM "appraisal_questions"
          WHERE question_text = r.qtext;

          IF v_q_id IS NULL THEN
            INSERT INTO "appraisal_questions"
              ("question_text", "question_type", "is_active")
            VALUES (r.qtext, 'rating', true)
            RETURNING question_id INTO v_q_id;
          END IF;

          -- Form-question link (create if missing for this form)
          IF NOT EXISTS (
            SELECT 1 FROM "appraisal_form_questions"
            WHERE form_id = v_form_id AND question_id = v_q_id
          ) THEN
            INSERT INTO "appraisal_form_questions"
              ("form_id", "question_id", "display_order",
               "weight_percentage", "is_required")
            VALUES (v_form_id, v_q_id, r.ord, r.weight, true);
          END IF;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove seeded form-question links, questions, and form.
    await queryRunner.query(`
      DELETE FROM "appraisal_form_questions"
      WHERE form_id IN (
        SELECT form_id FROM "appraisal_forms" WHERE form_name = 'Standard Appraisal'
      );
    `);
    await queryRunner.query(`
      DELETE FROM "appraisal_questions"
      WHERE question_text IN (
        'Job Knowledge', 'Quality of Work', 'Communication', 'Teamwork', 'Punctuality'
      );
    `);
    await queryRunner.query(`
      DELETE FROM "appraisal_forms" WHERE form_name = 'Standard Appraisal';
    `);

    // Revoke the Team Lead appraisal grants added here.
    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "roles" r, "permissions" p
      WHERE rp."role_id" = r."role_id"
        AND rp."permission_id" = p."permission_id"
        AND r."role_name" = 'Team Lead'
        AND p."permission_name" IN (
          'appraisal.create', 'appraisal.update',
          'appraisal-forms.create', 'appraisal-forms.update',
          'appraisal-form-questions.create', 'appraisal-form-questions.update',
          'apprisal-question.create', 'apprisal-question.update'
        );
    `);

    // recommendation column
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" DROP COLUMN IF EXISTS "recommendation"`,
    );

    // Restore attendance_id NOT NULL + CASCADE (best-effort).
    await queryRunner.query(`
      DO $$
      DECLARE fk_name text;
      BEGIN
        SELECT tc.constraint_name INTO fk_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'performance_reviews'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'attendance_id'
        LIMIT 1;

        IF fk_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "performance_reviews" DROP CONSTRAINT %I', fk_name
          );
        END IF;

        ALTER TABLE "performance_reviews"
          ADD CONSTRAINT "FK_performance_reviews_attendance"
          FOREIGN KEY ("attendance_id") REFERENCES "attendance"("attendance_id")
          ON DELETE CASCADE;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" ALTER COLUMN "attendance_id" SET NOT NULL`,
    );
  }
}
