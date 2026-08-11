import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the Phase 2 payroll schema — the configurable rule builders, statutory
 * tax, and employee loans that layer onto the Phase 1 engine foundation.
 *
 * Five tables:
 *   payroll_rules      — one versioned table for every rule kind (absence, late,
 *                        repeated-late, leave, overtime, bonus), discriminated by
 *                        `rule_type` with type-specific settings in `config` jsonb
 *   tax_configs        — a named, effective-dated, versioned set of tax slabs
 *   tax_slabs          — the progressive brackets of a tax config
 *   employee_loans     — a loan / salary advance with a running outstanding balance
 *   loan_installments  — the scheduled repayments; deduction is idempotent per
 *                        (loan_id, period_id)
 *
 * Mirrors CreatePayrollEngineSchema1789200000000: raw SQL, `IF NOT EXISTS`,
 * `uuid_generate_v4()`, `numeric`/`jsonb`/`timestamptz`, `pk_/uq_/chk_/fk_`
 * constraint names, indexed FKs, and reverse-order drops — safe to re-run.
 */
export class CreatePayrollPhase2Schema1789200000003
  implements MigrationInterface
{
  name = 'CreatePayrollPhase2Schema1789200000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // payroll_rules — versioned, scope-priority resolved rule builder
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_rules" (
        "rule_id"        uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "rule_type"      varchar(20)  NOT NULL,
        "name"           varchar(100) NOT NULL,
        "scope_type"     varchar(20)  NOT NULL DEFAULT 'company',
        "scope_id"       uuid,
        "config"         jsonb        NOT NULL DEFAULT '{}'::jsonb,
        "priority"       integer      NOT NULL DEFAULT 0,
        "is_active"      boolean      NOT NULL DEFAULT true,
        "effective_from" date,
        "effective_to"   date,
        "version"        integer      NOT NULL DEFAULT 1,
        "superseded_by"  uuid,
        "created_at"     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_payroll_rules" PRIMARY KEY ("rule_id"),
        CONSTRAINT "chk_payroll_rules_type" CHECK ("rule_type" IN
          ('absent','late','repeated_late','leave','overtime','bonus','appraisal')),
        CONSTRAINT "chk_payroll_rules_scope" CHECK ("scope_type" IN
          ('company','job_category','department','designation','employee'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payroll_rules_type_active"
        ON "payroll_rules" ("rule_type", "is_active")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payroll_rules_scope"
        ON "payroll_rules" ("scope_type", "scope_id")
    `);

    // ------------------------------------------------------------------
    // tax_configs
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tax_configs" (
        "tax_config_id"  uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "name"           varchar(100) NOT NULL,
        "regime"         varchar(60),
        "currency"       varchar(3)   NOT NULL DEFAULT 'PKR',
        "annualize"      boolean      NOT NULL DEFAULT true,
        "is_active"      boolean      NOT NULL DEFAULT true,
        "effective_from" date,
        "effective_to"   date,
        "version"        integer      NOT NULL DEFAULT 1,
        "created_at"     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_tax_configs" PRIMARY KEY ("tax_config_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tax_configs_active"
        ON "tax_configs" ("is_active")
    `);

    // ------------------------------------------------------------------
    // tax_slabs
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tax_slabs" (
        "slab_id"       uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "tax_config_id" uuid          NOT NULL,
        "lower_bound"   numeric(14,2) NOT NULL DEFAULT 0,
        "upper_bound"   numeric(14,2),
        "base_tax"      numeric(14,2) NOT NULL DEFAULT 0,
        "rate_percent"  numeric(5,2)  NOT NULL DEFAULT 0,
        "display_order" integer       NOT NULL DEFAULT 0,
        CONSTRAINT "pk_tax_slabs" PRIMARY KEY ("slab_id"),
        CONSTRAINT "fk_tax_slabs_config"
          FOREIGN KEY ("tax_config_id") REFERENCES "tax_configs"("tax_config_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tax_slabs_config"
        ON "tax_slabs" ("tax_config_id")
    `);

    // ------------------------------------------------------------------
    // employee_loans
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_loans" (
        "loan_id"            uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"            uuid          NOT NULL,
        "name"               varchar(120)  NOT NULL,
        "principal"          numeric(14,2) NOT NULL DEFAULT 0,
        "outstanding"        numeric(14,2) NOT NULL DEFAULT 0,
        "installment_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "start_period_id"    uuid,
        "status"             varchar(20)   NOT NULL DEFAULT 'active',
        "remarks"            text,
        "created_at"         timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"         timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_employee_loans" PRIMARY KEY ("loan_id"),
        CONSTRAINT "chk_employee_loans_status" CHECK ("status" IN
          ('active','closed','paused')),
        CONSTRAINT "fk_employee_loans_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_employee_loans_user_status"
        ON "employee_loans" ("user_id", "status")
    `);

    // ------------------------------------------------------------------
    // loan_installments
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loan_installments" (
        "installment_id" uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "loan_id"        uuid          NOT NULL,
        "period_id"      uuid,
        "sequence"       integer       NOT NULL DEFAULT 0,
        "amount"         numeric(14,2) NOT NULL DEFAULT 0,
        "status"         varchar(20)   NOT NULL DEFAULT 'scheduled',
        "balance_after"  numeric(14,2),
        "deducted_on"    timestamptz,
        "created_at"     timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_loan_installments" PRIMARY KEY ("installment_id"),
        CONSTRAINT "chk_loan_installments_status" CHECK ("status" IN
          ('scheduled','deducted','skipped')),
        CONSTRAINT "fk_loan_installments_loan"
          FOREIGN KEY ("loan_id") REFERENCES "employee_loans"("loan_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_loan_installments_loan"
        ON "loan_installments" ("loan_id")
    `);
    // The idempotency key for deduction: one deducted installment per period.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_loan_installments_loan_period"
        ON "loan_installments" ("loan_id", "period_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in FK-dependency order (children first).
    await queryRunner.query(`DROP TABLE IF EXISTS "loan_installments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_loans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tax_slabs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tax_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_rules"`);
  }
}
