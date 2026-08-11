import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the permission vocabulary for the configurable payroll engine and grants
 * it to the roles that operate it.
 *
 * Grant model (confirmed with the product owner):
 *   • HR (configures and processes payroll) — every new permission EXCEPT
 *     `payroll.approve`.
 *   • Admin — the same, PLUS `payroll.approve` (the run sign-off gate).
 *
 * The stored `role_name` for these two logical roles varies by install: the
 * admin role is 'Admin' on this database but 'Administrator' or 'Super Admin'
 * on others, and HR is 'HR Admin' or 'HR Manager'. Rather than guess one, we
 * grant to every known alias — the same set `auth.service.ts` `toFrontendRole`
 * folds into `administrator` / `hr_manager`, and the same shape as the
 * mail-infrastructure migration's GRANTED_ROLES list. The grant statements
 * CROSS JOIN on role_name, so an alias absent from a given install simply
 * matches zero rows: a clean no-op, exactly the NOT EXISTS grant pattern used
 * by PermissionTaxonomyAndHrAdminGrants. Grants are re-asserted idempotently.
 *
 * The approval gate is inert until `payroll_settings.approval_enabled` is turned
 * on, so out of the box HR Admin can carry a run all the way to locked without
 * an Administrator present.
 *
 * Idempotent: re-running inserts nothing new and revokes nothing.
 */
export class SeedPayrollModulePermissions1789200000001
  implements MigrationInterface
{
  name = 'SeedPayrollModulePermissions1789200000001';

  /** The permission vocabulary this migration owns. */
  private static readonly PERMISSIONS: Array<[string, string]> = [
    // --- General settings (§1) ---
    ['payroll-settings.view', 'View payroll settings'],
    ['payroll-settings.update', 'Edit payroll settings'],
    // --- Salary components builder (§2) ---
    ['salary-components.view', 'View salary components'],
    ['salary-components.create', 'Create salary components'],
    ['salary-components.update', 'Edit salary components'],
    ['salary-components.delete', 'Delete salary components'],
    // --- Salary structures builder (§3, §12, §13) ---
    ['salary-structures.view', 'View salary structures and assignments'],
    ['salary-structures.create', 'Create salary structures and assignments'],
    ['salary-structures.update', 'Edit salary structures and assignments'],
    ['salary-structures.delete', 'Delete salary structures and assignments'],
    // --- Payroll periods / run workflow (§1) ---
    ['payroll-periods.view', 'View payroll periods'],
    ['payroll-periods.create', 'Create payroll periods'],
    ['payroll-periods.update', 'Edit payroll periods'],
    ['payroll-periods.delete', 'Delete payroll periods'],
    // --- Run engine actions (§11, §14) ---
    ['payroll.preview', 'Preview a payslip calculation without persisting'],
    ['payroll.process', 'Process a payroll period and generate payslips'],
    ['payroll.approve', 'Approve a processed payroll run'],
    ['payroll.lock', 'Lock an approved payroll run'],
    // --- Payslips (§14) ---
    ['payslips.view', 'View payslips across the organisation'],
  ];

  /**
   * Everything except the approval gate — granted to both operating roles.
   * `payroll.approve` is intentionally omitted here and granted to
   * Administrator alone below.
   */
  private static readonly OPERATOR_PERMISSIONS =
    SeedPayrollModulePermissions1789200000001.PERMISSIONS.map(
      ([name]) => name,
    ).filter((name) => name !== 'payroll.approve');

  /**
   * Role names that operate payroll but must NOT approve their own run.
   * Every HR alias `toFrontendRole` maps to `hr_manager`.
   */
  private static readonly HR_ROLE_ALIASES = ['HR Admin', 'HR Manager', 'HR'];

  /**
   * Role names that get everything, INCLUDING `payroll.approve`. Every admin
   * alias `toFrontendRole` maps to `administrator`.
   */
  private static readonly ADMIN_ROLE_ALIASES = [
    'Admin',
    'Administrator',
    'Super Admin',
  ];

  /** role_name -> permission_name[] */
  private static readonly MATRIX: Record<string, string[]> =
    Object.fromEntries([
      ...SeedPayrollModulePermissions1789200000001.HR_ROLE_ALIASES.map(
        (role): [string, string[]] => [
          role,
          SeedPayrollModulePermissions1789200000001.OPERATOR_PERMISSIONS,
        ],
      ),
      ...SeedPayrollModulePermissions1789200000001.ADMIN_ROLE_ALIASES.map(
        (role): [string, string[]] => [
          role,
          [
            ...SeedPayrollModulePermissions1789200000001.OPERATOR_PERMISSIONS,
            'payroll.approve',
          ],
        ],
      ),
    ]);

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Permissions
    // ------------------------------------------------------------------
    for (const [
      name,
      description,
    ] of SeedPayrollModulePermissions1789200000001.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    // ------------------------------------------------------------------
    // 2. Grants. role_permissions has no unique constraint on
    //    (role_id, permission_id), so guard with NOT EXISTS rather than
    //    ON CONFLICT. A missing role (e.g. Administrator on installs that
    //    never seeded it) matches zero rows — a clean no-op.
    // ------------------------------------------------------------------
    for (const [roleName, permissionNames] of Object.entries(
      SeedPayrollModulePermissions1789200000001.MATRIX,
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
    // Revoke only the grants this migration defines, for only these roles.
    for (const [roleName, permissionNames] of Object.entries(
      SeedPayrollModulePermissions1789200000001.MATRIX,
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
        SeedPayrollModulePermissions1789200000001.PERMISSIONS.map(
          ([name]) => name,
        ),
      ],
    );
  }
}
