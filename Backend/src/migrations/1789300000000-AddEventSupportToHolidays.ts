import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the holiday calendar carry plain company events ("Dinner", "Town
 * Hall") alongside actual holidays, and lets either be announced to everyone
 * on creation.
 *
 * `event_type` distinguishes the two: `Holiday` keeps the exact behaviour the
 * table always had (excluded from leave/attendance/payroll working-day
 * counts by `HolidaysService.getHolidayDateSet`); `Event` is calendar-only —
 * it never removes a day from anyone's leave count. Existing rows default to
 * `Holiday`, so nothing already stored changes meaning.
 *
 * `notify` records whether the creator asked for an announcement when this
 * row was added; `notified_at` records whether that announcement actually
 * went out, so a failed send (e.g. no active employees) is visible instead of
 * silently assumed to have happened.
 *
 * Idempotent: safe to re-run.
 */
export class AddEventSupportToHolidays1789300000000
  implements MigrationInterface
{
  name = 'AddEventSupportToHolidays1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "holidays"
        ADD COLUMN IF NOT EXISTS "event_type" varchar(20) NOT NULL DEFAULT 'Holiday';
    `);

    await queryRunner.query(`
      ALTER TABLE "holidays"
        DROP CONSTRAINT IF EXISTS "CHK_holidays_event_type";
    `);
    await queryRunner.query(`
      ALTER TABLE "holidays"
        ADD CONSTRAINT "CHK_holidays_event_type"
        CHECK ("event_type" IN ('Holiday', 'Event'));
    `);

    await queryRunner.query(`
      ALTER TABLE "holidays"
        ADD COLUMN IF NOT EXISTS "notify" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      ALTER TABLE "holidays"
        ADD COLUMN IF NOT EXISTS "notified_at" timestamp NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "holidays" DROP COLUMN IF EXISTS "notified_at";
    `);
    await queryRunner.query(`
      ALTER TABLE "holidays" DROP COLUMN IF EXISTS "notify";
    `);
    await queryRunner.query(`
      ALTER TABLE "holidays" DROP CONSTRAINT IF EXISTS "CHK_holidays_event_type";
    `);
    await queryRunner.query(`
      ALTER TABLE "holidays" DROP COLUMN IF EXISTS "event_type";
    `);
  }
}
