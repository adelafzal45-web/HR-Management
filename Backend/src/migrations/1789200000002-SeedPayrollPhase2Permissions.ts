import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the permission vocabulary for the Phase 2 payroll rule builders (rules,
 * tax, loans) and the payroll register report, and grants it to the roles that
 * operate payroll.
 *
 * Grant model: these are all *configuration* permissions, not the run sign-off
 * gate — so both operating roles get the full set (there is no Phase 2 analogue
 * of `payroll.approve`, which stays Administrator-only from
 * SeedPayrollModulePermissions1789200000001).
 *   • HR (configures payroll) — every new permission.
 *   • Admin — the same.
 *
 * Role-name aliasing matches the Phase 1 seed exactly: the stored `role_name`
 * varies by install ('Admin'/'Administrator', 'HR Admin'/'HR Manager'), so we
 * grant to every known alias via a CROSS JOIN — an absent alias matches zero
 * rows, a clean no-op. `role_permissions` has no unique key, so grants are
 * guarded with NOT EXISTS rather than ON CONFLICT.
 *
 * Idempotent: re-running inserts nothing new and revokes nothing.
 */
export class SeedPayrollPhase2Permissions1789200000002
  implements MigrationInterface
{
  name = 'SeedPayrollPhase2Permissions1789200000002';

  /** The permission vocabulary this migration owns. */
  private static readonly PERMISSIONS: Array<[string, string]> = [
    // --- Rule builder (§4–8, §16) ---
    ['payroll-rules.view', 'View payroll rules'],
    ['payroll-rules.create', 'Create payroll rules'],
    ['payroll-rules.update', 'Edit payroll rules'],
    ['payroll-rules.delete', 'Delete payroll rules'],
    // --- Statutory tax (§10) ---
    ['payroll-tax.view', 'View tax configurations'],
    ['payroll-tax.create', 'Create tax configurations'],
    ['payroll-tax.update', 'Edit tax configurations'],
    ['payroll-tax.delete', 'Delete tax configurations'],
    // --- Employee loans / advances (§9) ---
    ['payroll-loans.view', 'View employee loans'],
    ['payroll-loans.create', 'Create employee loans'],
    ['payroll-loans.update', 'Edit employee loans'],
    ['payroll-loans.delete', 'Delete employee loans'],
    // --- Reporting (§14) ---
    ['payroll-reports.view', 'View payroll reports and registers'],
  ];

  /** All of them — no approval-class gate among Phase 2 permissions. */
  private static readonly OPERATOR_PERMISSIONS =
    SeedPayrollPhase2Permissions1789200000002.PERMISSIONS.map(([name]) => name);

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
        ...SeedPayrollPhase2Permissions1789200000002.HR_ROLE_ALIASES,
        ...SeedPayrollPhase2Permissions1789200000002.ADMIN_ROLE_ALIASES,
      ].map((role): [string, string[]] => [
        role,
        SeedPayrollPhase2Permissions1789200000002.OPERATOR_PERMISSIONS,
      ]),
    );

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Permissions
    for (const [
      name,
      description,
    ] of SeedPayrollPhase2Permissions1789200000002.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    // 2. Grants — guarded with NOT EXISTS; a missing role matches zero rows.
    for (const [roleName, permissionNames] of Object.entries(
      SeedPayrollPhase2Permissions1789200000002.MATRIX,
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
      SeedPayrollPhase2Permissions1789200000002.MATRIX,
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
        SeedPayrollPhase2Permissions1789200000002.PERMISSIONS.map(
          ([name]) => name,
        ),
      ],
    );
  }
}
