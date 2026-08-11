import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the permission vocabulary for Phase 3 — employee reimbursement claims,
 * loan-request approval, and one-click payroll setup — and grants it to the
 * roles that operate payroll.
 *
 * Grant model: HR and Admin get every permission below. Employees deliberately
 * get NONE of them. That is not an oversight — the employee-facing routes
 * (`/reimbursements/me`, `/payroll-loans/me`) carry no @RequirePermission at
 * all and are scoped hard to the caller's own user_id from the JWT, exactly
 * like `/payslips/me` and `/leave-requests/me`. Granting an employee the
 * org-wide `reimbursements.view` would let them read every colleague's claims;
 * granting `payroll-loans.create` would let them file a loan against someone
 * else's payroll. The `/me` routes are the whole employee surface.
 *
 * Role-name aliasing matches the Phase 1/2 seeds exactly: the stored `role_name`
 * varies by install ('Admin'/'Administrator', 'HR Admin'/'HR Manager'), so we
 * grant to every known alias via a CROSS JOIN — an absent alias matches zero
 * rows, a clean no-op. `role_permissions` has no unique key, so grants are
 * guarded with NOT EXISTS rather than ON CONFLICT.
 *
 * Idempotent: re-running inserts nothing new and revokes nothing.
 */
export class SeedPayrollPhase3Permissions1789200000005
  implements MigrationInterface
{
  name = 'SeedPayrollPhase3Permissions1789200000005';

  /** The permission vocabulary this migration owns. */
  private static readonly PERMISSIONS: Array<[string, string]> = [
    // --- Reimbursement claims ---
    ['reimbursements.view', 'View all employee reimbursement claims'],
    ['reimbursements.create', 'File a reimbursement claim for an employee'],
    ['reimbursements.update', 'Edit reimbursement claims'],
    ['reimbursements.delete', 'Delete reimbursement claims'],
    ['reimbursements.approve', 'Approve or reject reimbursement claims'],
    // --- Loan requests ---
    ['payroll-loans.approve', 'Approve or reject employee loan requests'],
    // --- Guided setup ---
    ['payroll.setup', 'Run the automatic payroll setup'],
  ];

  /** All of them — HR and Admin operate payroll together. */
  private static readonly OPERATOR_PERMISSIONS =
    SeedPayrollPhase3Permissions1789200000005.PERMISSIONS.map(([name]) => name);

  /** Every HR alias `toFrontendRole` folds into `hr_manager`. */
  private static readonly HR_ROLE_ALIASES = ['HR Admin', 'HR Manager', 'HR'];

  /** Every admin alias `toFrontendRole` folds into `administrator`. */
  private static readonly ADMIN_ROLE_ALIASES = [
    'Admin',
    'Administrator',
    'Super Admin',
  ];

  /** role_name -> permission_name[] */
  private static readonly MATRIX: Record<string, string[]> =
    Object.fromEntries(
      [
        ...SeedPayrollPhase3Permissions1789200000005.HR_ROLE_ALIASES,
        ...SeedPayrollPhase3Permissions1789200000005.ADMIN_ROLE_ALIASES,
      ].map((role): [string, string[]] => [
        role,
        SeedPayrollPhase3Permissions1789200000005.OPERATOR_PERMISSIONS,
      ]),
    );

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Permissions
    for (const [
      name,
      description,
    ] of SeedPayrollPhase3Permissions1789200000005.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    // 2. Grants — guarded with NOT EXISTS; a missing role matches zero rows.
    for (const [roleName, permissionNames] of Object.entries(
      SeedPayrollPhase3Permissions1789200000005.MATRIX,
    )) {
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_id")
         SELECT r."role_id", p."permission_id"
         FROM "roles" r
         CROSS JOIN "permissions" p
         WHERE r."role_name" = $1
           AND p."permission_name" = ANY($2::varchar[])
           AND NOT EXISTS (
             SELECT 1 FROM "role_permissions" rp
             WHERE rp."role_id" = r."role_id"
               AND rp."permission_id" = p."permission_id"
           )`,
        [roleName, permissionNames],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [roleName, permissionNames] of Object.entries(
      SeedPayrollPhase3Permissions1789200000005.MATRIX,
    )) {
      await queryRunner.query(
        `DELETE FROM "role_permissions" rp
         USING "roles" r, "permissions" p
         WHERE rp."role_id" = r."role_id"
           AND rp."permission_id" = p."permission_id"
           AND r."role_name" = $1
           AND p."permission_name" = ANY($2::varchar[])`,
        [roleName, permissionNames],
      );
    }

    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = ANY($1::varchar[])`,
      [
        SeedPayrollPhase3Permissions1789200000005.PERMISSIONS.map(
          ([name]) => name,
        ),
      ],
    );
  }
}
