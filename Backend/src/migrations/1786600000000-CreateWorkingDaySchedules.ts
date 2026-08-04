import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-day working schedule, resolved by specificity.
 *
 * Three tiers, most specific wins:
 *   1. department + designation  — e.g. Engineering / Support Engineer
 *   2. department only           — e.g. everyone in Engineering
 *   3. global default            — both NULL, the company-wide baseline
 *
 * Any (scope, day) pair with no row is treated as non-working: absence of a
 * row means the day is a weekend/holiday, so callers never have to enumerate
 * every off day. `is_working = false` rows are still allowed — they let a more
 * specific tier switch a day OFF that a broader tier switched on.
 *
 * `day_of_week` follows ISO-8601: 1 = Monday ... 7 = Sunday, matching
 * Postgres `EXTRACT(ISODOW FROM date)`.
 *
 * Uniqueness is enforced with three partial indexes rather than one constraint,
 * because in SQL `NULL <> NULL` — a plain UNIQUE over nullable columns would
 * happily allow duplicate global defaults.
 */
export class CreateWorkingDaySchedules1786600000000
  implements MigrationInterface
{
  name = 'CreateWorkingDaySchedules1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "working_day_schedules" (
        "schedule_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "department_id" uuid,
        "designation_id" uuid,
        "day_of_week" smallint NOT NULL,
        "is_working" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_working_day_schedules" PRIMARY KEY ("schedule_id"),
        CONSTRAINT "CHK_working_day_schedules_dow"
          CHECK ("day_of_week" BETWEEN 1 AND 7),
        -- A designation-scoped row must name its department, so resolution
        -- never has to guess which department a designation belongs to.
        CONSTRAINT "CHK_working_day_schedules_scope"
          CHECK ("designation_id" IS NULL OR "department_id" IS NOT NULL),
        CONSTRAINT "FK_working_day_schedules_department"
          FOREIGN KEY ("department_id") REFERENCES "departments"("department_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_working_day_schedules_designation"
          FOREIGN KEY ("designation_id") REFERENCES "designations"("designation_id")
          ON DELETE CASCADE
      )
    `);

    // One row per (scope, day). Partial indexes because NULL <> NULL.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wds_global"
        ON "working_day_schedules" ("day_of_week")
        WHERE "department_id" IS NULL AND "designation_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wds_department"
        ON "working_day_schedules" ("department_id", "day_of_week")
        WHERE "department_id" IS NOT NULL AND "designation_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wds_designation"
        ON "working_day_schedules" ("department_id", "designation_id", "day_of_week")
        WHERE "designation_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wds_lookup"
        ON "working_day_schedules" ("department_id", "designation_id")
    `);

    // Global default: Mon-Fri working, matching company_settings.working_days.
    // Sat/Sun are simply absent, which the resolver reads as non-working.
    await queryRunner.query(`
      INSERT INTO "working_day_schedules" ("department_id", "designation_id", "day_of_week", "is_working")
      SELECT NULL, NULL, d, true
      FROM generate_series(1, 5) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM "working_day_schedules"
        WHERE "department_id" IS NULL AND "designation_id" IS NULL AND "day_of_week" = d
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wds_lookup"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_wds_designation"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_wds_department"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_wds_global"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "working_day_schedules"`);
  }
}
