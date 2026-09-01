import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `salary_revisions` — the append-only history behind the base-salary
 * increment/decrement action.
 *
 * Each row captures one change to `users.salary`: the previous and new figures,
 * the signed delta, whether it was an increment or decrement, how HR expressed
 * it (a flat amount or a percentage), the reason, the effective date, and the
 * author. The service writes the row in the same transaction as the salary
 * update and its audit entry.
 *
 * Follows the payroll migration conventions: raw SQL, `IF NOT EXISTS`,
 * `uuid_generate_v4()`, `pk_/chk_/fk_` names, indexed FK, reverse-order drop.
 */
export class CreateSalaryRevisionsSchema1789400000005
  implements MigrationInterface
{
  name = 'CreateSalaryRevisionsSchema1789400000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_revisions" (
        "revision_id"     uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"         uuid          NOT NULL,
        "previous_salary" numeric(12,2),
        "new_salary"      numeric(12,2) NOT NULL,
        "delta"           numeric(12,2) NOT NULL DEFAULT 0,
        "change_type"     varchar(20)   NOT NULL,
        "input_mode"      varchar(10)   NOT NULL,
        "input_value"     numeric(12,2) NOT NULL DEFAULT 0,
        "reason"          text,
        "effective_date"  date          NOT NULL DEFAULT CURRENT_DATE,
        "created_by"      uuid,
        "created_at"      timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_salary_revisions" PRIMARY KEY ("revision_id"),
        CONSTRAINT "chk_salary_revisions_change_type" CHECK ("change_type" IN
          ('increment','decrement')),
        CONSTRAINT "chk_salary_revisions_input_mode" CHECK ("input_mode" IN
          ('amount','percent')),
        CONSTRAINT "fk_salary_revisions_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE,
        CONSTRAINT "fk_salary_revisions_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_salary_revisions_user"
        ON "salary_revisions" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_revisions"`);
  }
}
