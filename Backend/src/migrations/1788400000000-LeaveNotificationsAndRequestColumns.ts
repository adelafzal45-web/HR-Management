import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two column sets the Leave notification + redesigned-request work introduced
 * on the entities but that the earlier `CreateLeaveEntitlementSystem` migration
 * did not cover:
 *
 *   1. `notifications` gains addressing + categorisation columns so the bell can
 *      show per-user, per-category notices with deep links, instead of the
 *      original author-only broadcast table. `created_by` is relaxed to nullable
 *      because system-generated notices (leave decisions, balance updates) have
 *      no human author — attributing them to the approver would make
 *      "HR approved your leave" look self-sent in the approver's own bell.
 *
 *   2. `leave_requests` gains the redesigned-request columns: `duration_type`
 *      (Full Day / First Half / Second Half / Multiple Days), the optional
 *      attachment pointer, and the three decision-reason columns echoed into the
 *      employee's notification.
 *
 * Idempotent throughout — safe to re-run.
 */
export class LeaveNotificationsAndRequestColumns1788400000000
  implements MigrationInterface
{
  name = 'LeaveNotificationsAndRequestColumns1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. notifications: addressing, categorisation, deep links
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD COLUMN IF NOT EXISTS "category" character varying(40) NOT NULL DEFAULT 'General',
        ADD COLUMN IF NOT EXISTS "recipient_id" uuid,
        ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "link" character varying(255),
        ADD COLUMN IF NOT EXISTS "reference_id" uuid,
        ADD COLUMN IF NOT EXISTS "reference_type" character varying(40)
    `);

    // System notices have no author; historical rows had NOT NULL created_by.
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ALTER COLUMN "created_by" DROP NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_notifications_recipient'
        ) THEN
          ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_notifications_recipient"
            FOREIGN KEY ("recipient_id") REFERENCES "users"("user_id")
            ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_recipient_read"
        ON "notifications" ("recipient_id", "read_at")
    `);

    // ------------------------------------------------------------------
    // 2. leave_requests: duration type, attachment, decision reasons
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ADD COLUMN IF NOT EXISTS "duration_type" character varying(20) NOT NULL DEFAULT 'Full Day',
        ADD COLUMN IF NOT EXISTS "attachment_path" character varying(255),
        ADD COLUMN IF NOT EXISTS "attachment_name" character varying(255),
        ADD COLUMN IF NOT EXISTS "approval_reason" text,
        ADD COLUMN IF NOT EXISTS "rejection_reason" text,
        ADD COLUMN IF NOT EXISTS "cancellation_reason" text
    `);

    // Backfill duration_type from the pre-existing is_half_day flag so rows
    // created before this column read correctly in the planner. First Half is
    // the arbitrary-but-consistent choice for legacy half-days, which never
    // recorded which half.
    await queryRunner.query(`
      UPDATE "leave_requests"
        SET "duration_type" = CASE
          WHEN "is_half_day" = true THEN 'First Half'
          WHEN "start_date" <> "end_date" THEN 'Multiple Days'
          ELSE 'Full Day'
        END
      WHERE "duration_type" = 'Full Day'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        DROP COLUMN IF EXISTS "duration_type",
        DROP COLUMN IF EXISTS "attachment_path",
        DROP COLUMN IF EXISTS "attachment_name",
        DROP COLUMN IF EXISTS "approval_reason",
        DROP COLUMN IF EXISTS "rejection_reason",
        DROP COLUMN IF EXISTS "cancellation_reason"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notifications_recipient_read"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        DROP CONSTRAINT IF EXISTS "FK_notifications_recipient"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        DROP COLUMN IF EXISTS "category",
        DROP COLUMN IF EXISTS "recipient_id",
        DROP COLUMN IF EXISTS "read_at",
        DROP COLUMN IF EXISTS "link",
        DROP COLUMN IF EXISTS "reference_id",
        DROP COLUMN IF EXISTS "reference_type"
    `);

    // Note: created_by is intentionally NOT restored to NOT NULL on down —
    // doing so would fail if any system-generated (null-author) rows exist.
  }
}
