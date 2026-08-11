import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the configurable payroll engine schema (spec phase 1 foundation).
 *
 * Eight tables:
 *   payroll_settings              — single global row (id=1), like company_settings
 *   salary_components             — the component builder atoms
 *   salary_structures             — named bundles of components
 *   salary_structure_components   — component membership + per-structure overrides
 *   salary_structure_assignments  — structure → scope with effective dates
 *   employee_component_overrides  — per-employee component overrides
 *   payroll_periods               — a run's date window + workflow state
 *   payslips / payslip_lines      — the calculated result + snapshot lines
 *
 * The legacy flat `payroll` table is left untouched — it stays readable as
 * historical data while this engine becomes the source of truth.
 *
 * Written idempotently (`IF NOT EXISTS`, seeded row via ON CONFLICT) to match
 * CreateMeetingsTables / CreateLeaveEntitlementSystem, so it is safe to re-run.
 */
export class CreatePayrollEngineSchema1789200000000
  implements MigrationInterface
{
  name = 'CreatePayrollEngineSchema1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // payroll_settings — single row, enforced by CHECK (id = 1)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_settings" (
        "id"                      integer      NOT NULL DEFAULT 1,
        "frequency"               varchar(20)  NOT NULL DEFAULT 'monthly',
        "period_type"             varchar(20)  NOT NULL DEFAULT 'calendar',
        "currency"                varchar(10)  NOT NULL DEFAULT 'PKR',
        "working_days_source"     varchar(20)  NOT NULL DEFAULT 'attendance',
        "fixed_working_days"      integer      NOT NULL DEFAULT 26,
        "working_hours_per_day"   numeric(5,2) NOT NULL DEFAULT 8,
        "approval_enabled"        boolean      NOT NULL DEFAULT false,
        "auto_generate_payslip"   boolean      NOT NULL DEFAULT true,
        "employee_self_service"   boolean      NOT NULL DEFAULT true,
        "payroll_locking_enabled" boolean      NOT NULL DEFAULT true,
        "payslip_close_day"       integer      NOT NULL DEFAULT 20,
        "overtime_enabled"        boolean      NOT NULL DEFAULT false,
        "rounding"                varchar(10)  NOT NULL DEFAULT 'nearest',
        "created_at"              timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"              timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_payroll_settings" PRIMARY KEY ("id"),
        CONSTRAINT "chk_payroll_settings_singleton" CHECK ("id" = 1)
      )
    `);
    // Seed the single row so GET never 404s on a fresh install.
    await queryRunner.query(`
      INSERT INTO "payroll_settings" ("id") VALUES (1)
      ON CONFLICT ("id") DO NOTHING
    `);

    // ------------------------------------------------------------------
    // salary_components
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_components" (
        "component_id"                uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "name"                        varchar(100) NOT NULL,
        "code"                        varchar(40)  NOT NULL,
        "type"                        varchar(20)  NOT NULL,
        "calculation_type"            varchar(20)  NOT NULL,
        "amount"                      numeric(14,4) NOT NULL DEFAULT 0,
        "formula"                     text,
        "is_recurring"                boolean      NOT NULL DEFAULT true,
        "is_taxable"                  boolean      NOT NULL DEFAULT false,
        "include_in_gross"            boolean      NOT NULL DEFAULT true,
        "include_in_overtime"         boolean      NOT NULL DEFAULT false,
        "include_in_leave_deduction"  boolean      NOT NULL DEFAULT false,
        "include_in_bonus"            boolean      NOT NULL DEFAULT false,
        "display_order"               integer      NOT NULL DEFAULT 0,
        "is_active"                   boolean      NOT NULL DEFAULT true,
        "effective_from"              date,
        "effective_to"                date,
        "created_at"                  timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"                  timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_salary_components" PRIMARY KEY ("component_id"),
        CONSTRAINT "uq_salary_components_code" UNIQUE ("code"),
        CONSTRAINT "chk_salary_components_type" CHECK ("type" IN ('earning','deduction')),
        CONSTRAINT "chk_salary_components_calc" CHECK ("calculation_type" IN
          ('fixed','percent_basic','percent_gross','per_day','per_hour','formula'))
      )
    `);

    // ------------------------------------------------------------------
    // salary_structures
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_structures" (
        "structure_id" uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "name"         varchar(100) NOT NULL,
        "description"  text,
        "is_active"    boolean      NOT NULL DEFAULT true,
        "created_at"   timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"   timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_salary_structures" PRIMARY KEY ("structure_id"),
        CONSTRAINT "uq_salary_structures_name" UNIQUE ("name")
      )
    `);

    // ------------------------------------------------------------------
    // salary_structure_components
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_structure_components" (
        "structure_component_id"   uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "structure_id"             uuid          NOT NULL,
        "component_id"             uuid          NOT NULL,
        "override_calculation_type" varchar(20),
        "override_amount"          numeric(14,4),
        "override_formula"         text,
        "display_order"            integer       NOT NULL DEFAULT 0,
        CONSTRAINT "pk_salary_structure_components" PRIMARY KEY ("structure_component_id"),
        CONSTRAINT "uq_structure_component" UNIQUE ("structure_id", "component_id"),
        CONSTRAINT "fk_ssc_structure"
          FOREIGN KEY ("structure_id") REFERENCES "salary_structures"("structure_id") ON DELETE CASCADE,
        CONSTRAINT "fk_ssc_component"
          FOREIGN KEY ("component_id") REFERENCES "salary_components"("component_id") ON DELETE CASCADE
      )
    `);

    // ------------------------------------------------------------------
    // salary_structure_assignments
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_structure_assignments" (
        "assignment_id"  uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "structure_id"   uuid         NOT NULL,
        "scope_type"     varchar(20)  NOT NULL,
        "scope_id"       uuid,
        "base_salary"    numeric(12,2),
        "effective_from" date,
        "effective_to"   date,
        "is_active"      boolean      NOT NULL DEFAULT true,
        "created_at"     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_salary_structure_assignments" PRIMARY KEY ("assignment_id"),
        CONSTRAINT "chk_ssa_scope" CHECK ("scope_type" IN
          ('company','job_category','department','designation','employee')),
        CONSTRAINT "fk_ssa_structure"
          FOREIGN KEY ("structure_id") REFERENCES "salary_structures"("structure_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ssa_scope"
        ON "salary_structure_assignments" ("scope_type", "scope_id")
    `);

    // ------------------------------------------------------------------
    // employee_component_overrides
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_component_overrides" (
        "override_id"               uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"                   uuid          NOT NULL,
        "component_id"              uuid          NOT NULL,
        "override_calculation_type" varchar(20),
        "override_amount"           numeric(14,4),
        "override_formula"          text,
        "effective_from"            date,
        "effective_to"              date,
        "created_at"                timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"                timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_employee_component_overrides" PRIMARY KEY ("override_id"),
        CONSTRAINT "fk_eco_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE,
        CONSTRAINT "fk_eco_component"
          FOREIGN KEY ("component_id") REFERENCES "salary_components"("component_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_eco_user"
        ON "employee_component_overrides" ("user_id")
    `);

    // ------------------------------------------------------------------
    // payroll_periods
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_periods" (
        "period_id"    uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "name"         varchar(100) NOT NULL,
        "frequency"    varchar(20)  NOT NULL DEFAULT 'monthly',
        "period_start" date         NOT NULL,
        "period_end"   date         NOT NULL,
        "pay_date"     date,
        "working_days" integer      NOT NULL DEFAULT 0,
        "status"       varchar(20)  NOT NULL DEFAULT 'draft',
        "prepared_by"  uuid,
        "approved_by"  uuid,
        "processed_at" timestamptz,
        "approved_at"  timestamptz,
        "locked_at"    timestamptz,
        "notes"        text,
        "created_at"   timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"   timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_payroll_periods" PRIMARY KEY ("period_id"),
        CONSTRAINT "chk_payroll_periods_status" CHECK ("status" IN
          ('draft','processing','pending_approval','approved','locked','paid')),
        CONSTRAINT "fk_periods_prepared_by"
          FOREIGN KEY ("prepared_by") REFERENCES "users"("user_id") ON DELETE SET NULL,
        CONSTRAINT "fk_periods_approved_by"
          FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL
      )
    `);

    // ------------------------------------------------------------------
    // payslips
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payslips" (
        "payslip_id"        uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "period_id"         uuid          NOT NULL,
        "user_id"           uuid          NOT NULL,
        "structure_id"      uuid,
        "basic_salary"      numeric(12,2) NOT NULL DEFAULT 0,
        "gross_salary"      numeric(12,2) NOT NULL DEFAULT 0,
        "total_earnings"    numeric(12,2) NOT NULL DEFAULT 0,
        "total_deductions"  numeric(12,2) NOT NULL DEFAULT 0,
        "net_salary"        numeric(12,2) NOT NULL DEFAULT 0,
        "working_days"      integer       NOT NULL DEFAULT 0,
        "present_days"      numeric(6,2)  NOT NULL DEFAULT 0,
        "absent_days"       numeric(6,2)  NOT NULL DEFAULT 0,
        "paid_leave_days"   numeric(6,2)  NOT NULL DEFAULT 0,
        "unpaid_leave_days" numeric(6,2)  NOT NULL DEFAULT 0,
        "late_count"        integer       NOT NULL DEFAULT 0,
        "overtime_hours"    numeric(6,2)  NOT NULL DEFAULT 0,
        "overtime_amount"   numeric(12,2) NOT NULL DEFAULT 0,
        "status"            varchar(20)   NOT NULL DEFAULT 'generated',
        "calculation_json"  jsonb,
        "payment_date"      date,
        "created_at"        timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"        timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_payslips" PRIMARY KEY ("payslip_id"),
        CONSTRAINT "uq_payslip_period_user" UNIQUE ("period_id", "user_id"),
        CONSTRAINT "fk_payslips_period"
          FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("period_id") ON DELETE CASCADE,
        CONSTRAINT "fk_payslips_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payslips_user" ON "payslips" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payslips_period" ON "payslips" ("period_id")
    `);

    // ------------------------------------------------------------------
    // payslip_lines
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payslip_lines" (
        "line_id"       uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "payslip_id"    uuid          NOT NULL,
        "component_id"  uuid,
        "label"         varchar(100)  NOT NULL,
        "type"          varchar(20)   NOT NULL,
        "amount"        numeric(12,2) NOT NULL DEFAULT 0,
        "calc_note"     text,
        "display_order" integer       NOT NULL DEFAULT 0,
        CONSTRAINT "pk_payslip_lines" PRIMARY KEY ("line_id"),
        CONSTRAINT "chk_payslip_lines_type" CHECK ("type" IN ('earning','deduction')),
        CONSTRAINT "fk_payslip_lines_payslip"
          FOREIGN KEY ("payslip_id") REFERENCES "payslips"("payslip_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payslip_lines_payslip"
        ON "payslip_lines" ("payslip_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in FK-dependency order (children first).
    await queryRunner.query(`DROP TABLE IF EXISTS "payslip_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payslips"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_periods"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_component_overrides"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_structure_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_structure_components"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_structures"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_components"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_settings"`);
  }
}
