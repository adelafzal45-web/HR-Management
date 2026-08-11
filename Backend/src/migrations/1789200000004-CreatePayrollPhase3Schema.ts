import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 schema — employee-initiated payroll requests.
 *
 * Two changes:
 *   reimbursements  — a new table for expense claims an employee submits and
 *                     HR/Admin approve. An approved claim is picked up by the
 *                     next payroll run as a non-taxable earning line and then
 *                     stamped `paid` with the period/payslip that paid it, so
 *                     it can never be paid twice.
 *   employee_loans  — widened so an employee can *request* a loan: the status
 *                     CHECK gains 'pending' and 'rejected', plus the decision
 *                     audit columns HR fills in when approving or rejecting.
 *                     A loan only becomes 'active' (and only then generates an
 *                     installment schedule) once approved, which is why the
 *                     payroll engine — which already filters status='active' —
 *                     needs no change to stay safe.
 *
 * Mirrors CreatePayrollPhase2Schema1789200000003: raw SQL, `IF NOT EXISTS`,
 * `uuid_generate_v4()`, `numeric`/`timestamptz`, `pk_/chk_/fk_` constraint
 * names, indexed FKs, and reverse-order drops — safe to re-run.
 */
export class CreatePayrollPhase3Schema1789200000004
  implements MigrationInterface
{
  name = 'CreatePayrollPhase3Schema1789200000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // reimbursements — employee expense claims
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reimbursements" (
        "reimbursement_id" uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"          uuid          NOT NULL,
        "title"            varchar(160)  NOT NULL,
        "category"         varchar(60)   NOT NULL DEFAULT 'Other',
        "amount"           numeric(14,2) NOT NULL DEFAULT 0,
        "expense_date"     date          NOT NULL,
        "description"      text,
        "receipt_url"      varchar(500),
        "status"           varchar(20)   NOT NULL DEFAULT 'pending',
        "decided_by"       uuid,
        "decided_at"       timestamptz,
        "decision_note"    text,
        "paid_period_id"   uuid,
        "paid_payslip_id"  uuid,
        "created_at"       timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"       timestamptz   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_reimbursements" PRIMARY KEY ("reimbursement_id"),
        CONSTRAINT "chk_reimbursements_status" CHECK ("status" IN
          ('pending','approved','rejected','paid')),
        CONSTRAINT "chk_reimbursements_amount" CHECK ("amount" > 0),
        CONSTRAINT "fk_reimbursements_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE,
        CONSTRAINT "fk_reimbursements_decided_by"
          FOREIGN KEY ("decided_by") REFERENCES "users"("user_id") ON DELETE SET NULL,
        CONSTRAINT "fk_reimbursements_period"
          FOREIGN KEY ("paid_period_id") REFERENCES "payroll_periods"("period_id") ON DELETE SET NULL,
        CONSTRAINT "fk_reimbursements_payslip"
          FOREIGN KEY ("paid_payslip_id") REFERENCES "payslips"("payslip_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reimbursements_user_status"
        ON "reimbursements" ("user_id", "status")
    `);
    // The engine's per-period lookup: approved-and-unpaid claims by date.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reimbursements_status_date"
        ON "reimbursements" ("status", "expense_date")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reimbursements_paid_period"
        ON "reimbursements" ("paid_period_id")
    `);

    // ------------------------------------------------------------------
    // employee_loans — allow the request lifecycle
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        DROP CONSTRAINT IF EXISTS "chk_employee_loans_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        ADD CONSTRAINT "chk_employee_loans_status" CHECK ("status" IN
          ('pending','active','closed','paused','rejected'))
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        ADD COLUMN IF NOT EXISTS "requested_at"  timestamptz,
        ADD COLUMN IF NOT EXISTS "decided_by"    uuid,
        ADD COLUMN IF NOT EXISTS "decided_at"    timestamptz,
        ADD COLUMN IF NOT EXISTS "decision_note" text
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        DROP CONSTRAINT IF EXISTS "fk_employee_loans_decided_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        ADD CONSTRAINT "fk_employee_loans_decided_by"
          FOREIGN KEY ("decided_by") REFERENCES "users"("user_id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // employee_loans: shed the decision columns, then narrow the status CHECK
    // back to the Phase 2 vocabulary. Rows parked in a Phase 3-only state are
    // normalised first (pending -> paused, rejected -> closed) so re-adding the
    // narrower constraint cannot fail on live data.
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        DROP CONSTRAINT IF EXISTS "fk_employee_loans_decided_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        DROP COLUMN IF EXISTS "decision_note",
        DROP COLUMN IF EXISTS "decided_at",
        DROP COLUMN IF EXISTS "decided_by",
        DROP COLUMN IF EXISTS "requested_at"
    `);
    await queryRunner.query(
      `UPDATE "employee_loans" SET "status" = 'paused' WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `UPDATE "employee_loans" SET "status" = 'closed' WHERE "status" = 'rejected'`,
    );
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        DROP CONSTRAINT IF EXISTS "chk_employee_loans_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_loans"
        ADD CONSTRAINT "chk_employee_loans_status" CHECK ("status" IN
          ('active','closed','paused'))
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "reimbursements"`);
  }
}
