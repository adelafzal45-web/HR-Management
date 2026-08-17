import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the source + audit trail to attendance and guarantees one row per
 * employee per day.
 *
 * `attendance_source` tells a manual/remote entry ('Online') apart from a
 * physical device punch ('Device'); it defaults to 'Online' so every existing
 * row keeps a sensible value and a CHECK constraint mirrors the DTO allow-list.
 * `created_by` / `updated_by` record who filed and who last changed a row —
 * nullable, since rows predating this column (and any future system insert)
 * have no acting user; both FK to `users` and null on user delete rather than
 * cascading, so deleting a user never erases the attendance history they
 * touched. `created_at` / `updated_at` back the entity's @CreateDateColumn /
 * @UpdateDateColumn.
 *
 * The unique index `UQ_attendance_user_date` closes the check-then-insert race
 * the app-level duplicate guard cannot: two concurrent manual marks for the
 * same employee/date now fail at the database, surfaced as a friendly
 * BadRequestException by the service. It is created only after asserting no
 * duplicate pair already exists — the migration refuses rather than deletes, so
 * no attendance record is ever silently dropped.
 *
 * Idempotent: columns use IF NOT EXISTS, constraints are dropped-then-added, and
 * the index uses IF NOT EXISTS.
 */
export class AttendanceSourceAuditAndUniqueDate1789400000001
  implements MigrationInterface
{
  name = 'AttendanceSourceAuditAndUniqueDate1789400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Columns. Defaults chosen so applying this to a populated table
    //    changes no existing behaviour: every prior row reads as an 'Online'
    //    entry with an unknown author.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "attendance"
        ADD COLUMN IF NOT EXISTS "attendance_source" character varying(20) NOT NULL DEFAULT 'Online',
        ADD COLUMN IF NOT EXISTS "created_by" uuid,
        ADD COLUMN IF NOT EXISTS "updated_by" uuid,
        ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    `);

    // ------------------------------------------------------------------
    // 2. Guard the source against typos at the DB, matching ATTENDANCE_SOURCES.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "attendance"
        DROP CONSTRAINT IF EXISTS "CHK_attendance_source"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance"
        ADD CONSTRAINT "CHK_attendance_source"
        CHECK ("attendance_source" IN ('Device', 'Online'))
    `);

    // ------------------------------------------------------------------
    // 3. FK the audit columns to users. ON DELETE SET NULL: removing a user
    //    must not delete the attendance rows they created or edited.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "attendance"
        DROP CONSTRAINT IF EXISTS "FK_attendance_created_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance"
        ADD CONSTRAINT "FK_attendance_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance"
        DROP CONSTRAINT IF EXISTS "FK_attendance_updated_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance"
        ADD CONSTRAINT "FK_attendance_updated_by"
        FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL
    `);

    // ------------------------------------------------------------------
    // 4. One row per (employee, date). The app has always guarded this, so a
    //    clean database has no duplicates; if any slipped in, refuse loudly
    //    rather than delete data, so an operator can reconcile the rows first.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      DO $$
      DECLARE
        dupe_pairs integer;
      BEGIN
        SELECT count(*) INTO dupe_pairs FROM (
          SELECT 1
          FROM "attendance"
          GROUP BY "user_id", "attendance_date"
          HAVING count(*) > 1
        ) d;
        IF dupe_pairs > 0 THEN
          RAISE EXCEPTION
            'Cannot add unique (user_id, attendance_date) index: % duplicate employee/date pair(s) exist. Reconcile them before running this migration.',
            dupe_pairs;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attendance_user_date"
        ON "attendance" ("user_id", "attendance_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_attendance_user_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "FK_attendance_updated_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "FK_attendance_created_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "CHK_attendance_source"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance"
        DROP COLUMN IF EXISTS "updated_at",
        DROP COLUMN IF EXISTS "created_at",
        DROP COLUMN IF EXISTS "updated_by",
        DROP COLUMN IF EXISTS "created_by",
        DROP COLUMN IF EXISTS "attendance_source"
    `);
  }
}
