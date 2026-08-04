import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the missing `break_duration_minutes` column to `shifts`.
 *
 * The Shifts spec is "name, start time, end time, break duration, grace period",
 * but the table only ever had grace period — break duration had no home, so the
 * Settings form could not round-trip it.
 *
 * Defaults to 0 so existing rows keep their current effective behaviour.
 */
export class AddShiftBreakDuration1786500000000 implements MigrationInterface {
  name = 'AddShiftBreakDuration1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shifts"
      ADD COLUMN IF NOT EXISTS "break_duration_minutes" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "shifts"
      ADD CONSTRAINT "CHK_shifts_break_duration"
      CHECK ("break_duration_minutes" >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shifts" DROP CONSTRAINT IF EXISTS "CHK_shifts_break_duration"
    `);
    await queryRunner.query(`
      ALTER TABLE "shifts" DROP COLUMN IF EXISTS "break_duration_minutes"
    `);
  }
}
