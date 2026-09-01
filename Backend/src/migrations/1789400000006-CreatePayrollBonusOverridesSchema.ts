import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `payroll_bonus_overrides` — the per-(employee, period) manual bonus
 * behind the editable Bonus column in the Run Payroll grid.
 *
 * Each row is one employee's hand-set bonus for one payroll run: the amount (0
 * explicitly cancels the bonus), an optional memo, and the author. A unique
 * index on (user_id, period_id) enforces one override per employee per run,
 * which the service upserts on. The engine reads the row for the period being
 * computed and honors it with precedence over the configured bonus rule.
 *
 * Follows the payroll migration conventions: raw SQL, `IF NOT EXISTS`,
 * `uuid_generate_v4()`, `pk_/uq_/fk_` names, indexed FKs, reverse-order drop.
 */
export class CreatePayrollBonusOverridesSchema1789400000006
  implements MigrationInterface
{
  name = 'CreatePayrollBonusOverridesSchema1789400000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_bonus_overrides" (
        "bonus_override_id" uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"           uuid          NOT NULL,
        "period_id"         uuid          NOT NULL,
        "amount"            numeric(12,2) NOT NULL DEFAULT 0,
        "note"              text,
        "created_by"        uuid,
        "created_at"        timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"        timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_payroll_bonus_overrides" PRIMARY KEY ("bonus_override_id"),
        CONSTRAINT "fk_payroll_bonus_overrides_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE,
        CONSTRAINT "fk_payroll_bonus_overrides_period"
          FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("period_id") ON DELETE CASCADE,
        CONSTRAINT "fk_payroll_bonus_overrides_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_bonus_overrides_user_period"
        ON "payroll_bonus_overrides" ("user_id", "period_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payroll_bonus_overrides_period"
        ON "payroll_bonus_overrides" ("period_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_bonus_overrides"`);
  }
}
