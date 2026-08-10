import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audience targeting for composed notifications.
 *
 * Until now `NotificationsService.create()` saved a single row with no
 * recipient, and a null `recipient_id` means "company-wide" — so every
 * notification HR composed went to everyone, whatever they intended. Targeting
 * is implemented by fanning out one row per resolved recipient (the same shape
 * `pushMany` already writes for leave and meeting notices), which is also what
 * finally makes `read_at` per-user rather than shared.
 *
 * That fan-out needs a way to recognise the rows that came from one send:
 *
 *   - `batch_id` groups them, so the Sent view shows "Engineering — 12
 *     recipients" instead of twelve identical rows, and editing or deleting a
 *     notification applies to everyone who received it rather than one copy.
 *   - `audience_type` / `audience_department_id` record *how* the list was
 *     chosen. Kept alongside the resolved rows rather than derived from them:
 *     "everyone in Engineering" must keep reading that way even after someone
 *     transfers out, exactly as `meetings.audience_type` does.
 *
 * `audience_type` defaults to 'All' because that is what every pre-existing
 * row (null recipient, visible to everybody) actually was — the default
 * describes the history correctly instead of mislabelling it.
 *
 * Idempotent throughout — safe to re-run.
 */
export class NotificationAudienceTargeting1789000000000
  implements MigrationInterface
{
  name = 'NotificationAudienceTargeting1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD COLUMN IF NOT EXISTS "batch_id" uuid,
        ADD COLUMN IF NOT EXISTS "audience_type" character varying(20) NOT NULL DEFAULT 'All',
        ADD COLUMN IF NOT EXISTS "audience_department_id" uuid
    `);

    // ON DELETE SET NULL, not CASCADE: deleting a department must not erase the
    // notifications its members were sent. The rows keep their recipients and
    // fall back to rendering the audience without a department name.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_notifications_audience_department'
        ) THEN
          ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_notifications_audience_department"
            FOREIGN KEY ("audience_department_id")
            REFERENCES "departments"("department_id")
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // The Sent view groups by batch_id and orders by MIN(created_at); the
    // partial index keeps that off a sequential scan without indexing the
    // legacy rows, which have no batch.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_batch"
        ON "notifications" ("batch_id")
        WHERE "batch_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notifications_batch"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        DROP CONSTRAINT IF EXISTS "FK_notifications_audience_department"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        DROP COLUMN IF EXISTS "batch_id",
        DROP COLUMN IF EXISTS "audience_type",
        DROP COLUMN IF EXISTS "audience_department_id"
    `);
  }
}
