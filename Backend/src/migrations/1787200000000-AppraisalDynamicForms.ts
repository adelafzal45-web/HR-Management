import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dynamic appraisal forms: multiple question types, a reusable question bank,
 * two-mode Team Lead scoping, and a locked submit -> approve/reopen workflow.
 *
 * 1. `appraisal_questions.question_type` gains a CHECK for the five supported
 *    types. Existing rows are normalised first — live data holds a mix of
 *    'rating', 'Rating' and 'Text', so adding the constraint without a backfill
 *    would fail on deploy.
 * 2. `appraisal_form_questions` gains snapshot columns. A question row may now
 *    be shared by many forms; the snapshot is what stops a later bank edit
 *    rewriting the wording of a form that is already published (and of the
 *    reviews submitted against it). Draft forms read the live bank, published
 *    forms read the snapshot.
 * 3. `team_lead_assignments` (+ members join) replaces "every member of my
 *    department" as the Team Lead visibility rule.
 * 4. `review_approvals` — append-only submit/approve/reject/reopen trail.
 * 5. `appraisal_notifications` — recipient-addressed, deduplicated reminders.
 *    The existing `notifications` table is an announcement board with no
 *    recipient, no read state and no dedupe key, so it cannot express "remind
 *    this lead once before this shift".
 * 6. `performance_reviews` gains the lock/approval columns.
 *
 * Idempotent: safe to re-run.
 */
export class AppraisalDynamicForms1787200000000 implements MigrationInterface {
  name = 'AppraisalDynamicForms1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Question types
    // ------------------------------------------------------------------
    // Normalise before constraining. 'Text' becomes 'text_feedback'; the rest
    // lower-case cleanly ('Rating' -> 'rating'). Anything unrecognised falls
    // back to 'rating', which is what every pre-existing question actually was
    // — the facade hardcoded it on write.
    await queryRunner.query(`
      UPDATE "appraisal_questions"
         SET "question_type" = CASE lower(coalesce("question_type", ''))
           WHEN 'text'           THEN 'text_feedback'
           WHEN 'text_feedback'  THEN 'text_feedback'
           WHEN 'yes_no'         THEN 'yes_no'
           WHEN 'yesno'          THEN 'yes_no'
           WHEN 'multiple_choice' THEN 'multiple_choice'
           WHEN 'dropdown'       THEN 'dropdown'
           ELSE 'rating'
         END;
    `);

    await queryRunner.query(`
      ALTER TABLE "appraisal_questions"
        ALTER COLUMN "question_type" SET NOT NULL,
        ALTER COLUMN "question_type" SET DEFAULT 'rating';
    `);

    await queryRunner.query(`
      ALTER TABLE "appraisal_questions"
        DROP CONSTRAINT IF EXISTS "CHK_aq_question_type";
    `);
    await queryRunner.query(`
      ALTER TABLE "appraisal_questions"
        ADD CONSTRAINT "CHK_aq_question_type" CHECK ("question_type" IN (
          'rating', 'yes_no', 'multiple_choice', 'dropdown', 'text_feedback'
        ));
    `);

    // Option scores are a percentage-of-max within their own question, so a
    // negative score has no meaning and would invert the weighting.
    await queryRunner.query(`
      ALTER TABLE "appraisal_question_options"
        DROP CONSTRAINT IF EXISTS "CHK_aqo_score_non_negative";
    `);
    await queryRunner.query(`
      ALTER TABLE "appraisal_question_options"
        ADD CONSTRAINT "CHK_aqo_score_non_negative" CHECK ("score" >= 0);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_aqo_question"
        ON "appraisal_question_options" ("question_id");
    `);

    // ------------------------------------------------------------------
    // 2. Snapshot columns on the per-form question link
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        ADD COLUMN IF NOT EXISTS "snapshot_text"    text,
        ADD COLUMN IF NOT EXISTS "snapshot_type"    character varying(30),
        ADD COLUMN IF NOT EXISTS "snapshot_options" jsonb;
    `);

    // Forms that are already published predate snapshotting. Freeze their
    // current wording now, or their first read after this deploy would fall
    // back to the live bank and silently pick up any later edit — exactly the
    // failure the snapshot exists to prevent.
    await queryRunner.query(`
      UPDATE "appraisal_form_questions" fq
         SET "snapshot_text" = q."question_text",
             "snapshot_type" = q."question_type",
             "snapshot_options" = COALESCE((
               SELECT jsonb_agg(
                        jsonb_build_object(
                          'optionId',     o."option_id",
                          'optionText',   o."option_text",
                          'score',        o."score",
                          'displayOrder', o."display_order"
                        ) ORDER BY o."display_order", o."option_id"
                      )
               FROM "appraisal_question_options" o
               WHERE o."question_id" = q."question_id"
             ), '[]'::jsonb)
        FROM "appraisal_questions" q, "appraisal_forms" f
       WHERE fq."question_id" = q."question_id"
         AND fq."form_id" = f."form_id"
         AND f."status" <> 'Draft'
         AND fq."snapshot_text" IS NULL;
    `);

    // ------------------------------------------------------------------
    // 3. Team Lead assignments
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "team_lead_assignments" (
        "assignment_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "team_lead_id"  uuid NOT NULL,
        "mode"          character varying(20) NOT NULL,
        "department_id" uuid,
        "created_by"    uuid,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_team_lead_assignments" PRIMARY KEY ("assignment_id"),
        CONSTRAINT "FK_tla_team_lead" FOREIGN KEY ("team_lead_id")
          REFERENCES "users"("user_id") ON DELETE CASCADE,
        CONSTRAINT "FK_tla_department" FOREIGN KEY ("department_id")
          REFERENCES "departments"("department_id") ON DELETE CASCADE,
        CONSTRAINT "FK_tla_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("user_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_tla_mode" CHECK ("mode" IN ('DEPARTMENT', 'MEMBERS')),
        -- A department-wide grant is meaningless without the department.
        CONSTRAINT "CHK_tla_department_required" CHECK (
          "mode" <> 'DEPARTMENT' OR "department_id" IS NOT NULL
        )
      );
    `);

    // At most one department-wide grant per lead. Partial, because MEMBERS
    // rows are allowed to repeat per lead.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tla_lead_department_mode"
        ON "team_lead_assignments" ("team_lead_id")
        WHERE "mode" = 'DEPARTMENT';
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tla_team_lead"
        ON "team_lead_assignments" ("team_lead_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "team_lead_assignment_members" (
        "assignment_id" uuid NOT NULL,
        "user_id"       uuid NOT NULL,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_team_lead_assignment_members"
          PRIMARY KEY ("assignment_id", "user_id"),
        CONSTRAINT "FK_tlam_assignment" FOREIGN KEY ("assignment_id")
          REFERENCES "team_lead_assignments"("assignment_id") ON DELETE CASCADE,
        CONSTRAINT "FK_tlam_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("user_id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tlam_user"
        ON "team_lead_assignment_members" ("user_id");
    `);

    // ------------------------------------------------------------------
    // 4. Review approvals (append-only)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_approvals" (
        "approval_id"   uuid NOT NULL DEFAULT uuid_generate_v4(),
        "review_id"     uuid NOT NULL,
        "action"        character varying(20) NOT NULL,
        "actor_user_id" uuid,
        "comment"       text,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_approvals" PRIMARY KEY ("approval_id"),
        CONSTRAINT "FK_ra_review" FOREIGN KEY ("review_id")
          REFERENCES "performance_reviews"("review_id") ON DELETE CASCADE,
        -- SET NULL, not CASCADE: deleting a user must not erase the record of
        -- what they approved. Same reasoning as audit_logs.actor_user_id.
        CONSTRAINT "FK_ra_actor" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("user_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_ra_action" CHECK (
          "action" IN ('SUBMIT', 'APPROVE', 'REJECT', 'REOPEN')
        )
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ra_review"
        ON "review_approvals" ("review_id", "created_at");
    `);

    // ------------------------------------------------------------------
    // 5. Appraisal notifications
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisal_notifications" (
        "notification_id"   uuid NOT NULL DEFAULT uuid_generate_v4(),
        "recipient_user_id" uuid NOT NULL,
        "type"              character varying(40) NOT NULL,
        "title"             character varying(200) NOT NULL,
        "message"           text NOT NULL,
        "related_review_id" uuid,
        "dedupe_key"        character varying(120),
        "is_read"           boolean NOT NULL DEFAULT false,
        "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appraisal_notifications" PRIMARY KEY ("notification_id"),
        CONSTRAINT "FK_an_recipient" FOREIGN KEY ("recipient_user_id")
          REFERENCES "users"("user_id") ON DELETE CASCADE,
        CONSTRAINT "FK_an_review" FOREIGN KEY ("related_review_id")
          REFERENCES "performance_reviews"("review_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_an_type" CHECK ("type" IN (
          'SHIFT_REMINDER', 'PENDING_DIGEST', 'REVIEW_REOPENED', 'REVIEW_APPROVED'
        ))
      );
    `);

    // This index is what makes the reminder cron idempotent. It runs every 15
    // minutes across a ~10 minute trigger window, so without it a lead would
    // get the same reminder several times per shift.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_an_dedupe_key"
        ON "appraisal_notifications" ("dedupe_key")
        WHERE "dedupe_key" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_an_recipient_unread"
        ON "appraisal_notifications" ("recipient_user_id", "is_read", "created_at");
    `);

    // ------------------------------------------------------------------
    // 6. Review lock / approval columns
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
        ADD COLUMN IF NOT EXISTS "submitted_at"         TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "locked_at"            TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "approved_by_user_id"  uuid,
        ADD COLUMN IF NOT EXISTS "approved_at"          TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "is_auto_generated"    boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
        DROP CONSTRAINT IF EXISTS "FK_pr_approved_by";
    `);
    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
        ADD CONSTRAINT "FK_pr_approved_by" FOREIGN KEY ("approved_by_user_id")
          REFERENCES "users"("user_id") ON DELETE SET NULL;
    `);

    // 'Completed' was the old terminal state for a submitted review. The
    // workflow now distinguishes Submitted from Approved, so fold the legacy
    // value into Submitted and backfill the lock timestamps it implies.
    await queryRunner.query(`
      UPDATE "performance_reviews"
         SET "status" = 'Submitted'
       WHERE "status" = 'Completed';
    `);
    await queryRunner.query(`
      UPDATE "performance_reviews"
         SET "submitted_at" = COALESCE("submitted_at", "updated_at", "created_at"),
             "locked_at"    = COALESCE("locked_at", "updated_at", "created_at")
       WHERE "status" IN ('Submitted', 'Approved')
         AND ("submitted_at" IS NULL OR "locked_at" IS NULL);
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
        DROP CONSTRAINT IF EXISTS "CHK_pr_status";
    `);
    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
        ADD CONSTRAINT "CHK_pr_status" CHECK ("status" IN (
          'Draft', 'Submitted', 'Approved', 'Rejected'
        ));
    `);

    // Auto-generation must be safe to re-run: one review per employee per form
    // per period. Partial, because form_id is nullable on legacy rows.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pr_reviewee_form_period"
        ON "performance_reviews" ("reviewee_id", "form_id", "review_period")
        WHERE "form_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_pr_reviewee_form_period"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" DROP CONSTRAINT IF EXISTS "CHK_pr_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" DROP CONSTRAINT IF EXISTS "FK_pr_approved_by"`,
    );
    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
        DROP COLUMN IF EXISTS "is_auto_generated",
        DROP COLUMN IF EXISTS "approved_at",
        DROP COLUMN IF EXISTS "approved_by_user_id",
        DROP COLUMN IF EXISTS "locked_at",
        DROP COLUMN IF EXISTS "submitted_at";
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "appraisal_notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "review_approvals"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "team_lead_assignment_members"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "team_lead_assignments"`);

    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP COLUMN IF EXISTS "snapshot_options",
        DROP COLUMN IF EXISTS "snapshot_type",
        DROP COLUMN IF EXISTS "snapshot_text";
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aqo_question"`);
    await queryRunner.query(
      `ALTER TABLE "appraisal_question_options" DROP CONSTRAINT IF EXISTS "CHK_aqo_score_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appraisal_questions" DROP CONSTRAINT IF EXISTS "CHK_aq_question_type"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appraisal_questions"
        ALTER COLUMN "question_type" DROP DEFAULT;
    `);
  }
}
