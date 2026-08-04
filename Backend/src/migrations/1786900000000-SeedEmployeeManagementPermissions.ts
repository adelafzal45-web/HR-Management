import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the fine-grained `employees.*` permissions for the Employee Management
 * module, plus `audit-logs.view`.
 *
 * Naming: the existing codebase uses the plural `employees.*` prefix
 * (`employees.view`, `employees.create`, `employees.update`,
 * `employees.delete`, seeded by SeedThreeRoleRbac). The new sub-permissions
 * extend that convention rather than introducing a parallel singular
 * `employee.*` namespace — two prefixes meaning the same thing would guarantee
 * that a guard eventually checks the one that was never granted.
 *
 * Consolidations, and why:
 *
 *   - `login.enable` / `login.disable` → `login.manage`. Nothing can
 *     meaningfully grant one without the other; whoever can switch an account
 *     off can switch it back on.
 *   - `card.view` / `card.download` / `card.print` → `card.view` +
 *     `card.download`. Printing happens in the browser from data already
 *     rendered on screen, so a separate "print" permission would be
 *     unenforceable — anyone who can see a card can print it.
 *   - `profile.view` / `profile.edit` are NOT seeded for self-access. Every
 *     employee reads and edits their own profile through the `/users/me/*`
 *     routes, which are gated on authentication alone. A permission that must
 *     be granted to literally everyone is not an access control.
 *
 * `profile.email.edit` is genuinely optional and defaults to nobody: whether an
 * employee may change their own contact email is a policy decision, so it is
 * seeded ungranted and HR can enable it per role.
 */
export class SeedEmployeeManagementPermissions1786900000000
  implements MigrationInterface
{
  name = 'SeedEmployeeManagementPermissions1786900000000';

  private static readonly PERMISSIONS: Array<[string, string]> = [
    // Team hierarchy
    ['employees.team.view', "View a Team Lead's team members"],
    ['employees.team.manage', 'Add and remove members from a team'],
    ['employees.teamlead.assign', "Assign or change an employee's Team Lead"],

    // Compensation
    ['employees.salary.view', 'View employee salary'],
    ['employees.salary.edit', 'Change employee salary'],
    ['employees.payroll.view', 'View employee bank and payroll details'],
    ['employees.payroll.edit', 'Change employee bank and payroll details'],

    // Leave
    ['employees.leave.assign', 'Assign leave types and balances to an employee'],

    // Access control
    ['employees.role.assign', "Assign a role to an employee"],
    ['employees.login.manage', 'Enable or disable account access and login channels'],
    ['employees.password.reset', "Reset another employee's password"],
    [
      'employees.profile.email.edit',
      'Allow an employee to change their own contact email',
    ],

    // Emergency contact — separated from the main record because it is
    // personal next-of-kin data that not every viewer of an employee needs.
    ['employees.emergency.view', 'View emergency contact details'],
    ['employees.emergency.edit', 'Change emergency contact details'],

    // Documents. Seeded now so the UI can gate on them; the storage API itself
    // is not yet implemented.
    ['employees.documents.view', 'View employee documents'],
    ['employees.documents.upload', 'Upload employee documents'],
    ['employees.documents.delete', 'Delete employee documents'],

    // ID card
    ['employees.card.view', 'View employee ID cards'],
    ['employees.card.download', 'Download or print employee ID cards as PDF'],

    // Bulk operations
    ['employees.export', 'Export the employee list'],
    ['employees.import', 'Bulk-import employees'],

    // Audit
    ['audit-logs.view', 'View the audit trail of record changes'],
  ];

  /**
   * Grants per role.
   *
   * Team Lead gets read access to their own team and nothing else — notably
   * not salary, payroll, or any account control. A lead seeing their reports'
   * compensation is a deliberate no.
   *
   * Employee appears nowhere: self-service runs through /users/me/*, which
   * needs no grant.
   */
  private static readonly MATRIX: Record<string, string[]> = {
    Admin: [
      'employees.team.view',
      'employees.team.manage',
      'employees.teamlead.assign',
      'employees.salary.view',
      'employees.salary.edit',
      'employees.payroll.view',
      'employees.payroll.edit',
      'employees.leave.assign',
      'employees.role.assign',
      'employees.login.manage',
      'employees.password.reset',
      'employees.emergency.view',
      'employees.emergency.edit',
      'employees.documents.view',
      'employees.documents.upload',
      'employees.documents.delete',
      'employees.card.view',
      'employees.card.download',
      'employees.export',
      'employees.import',
      'audit-logs.view',
    ],
    'HR Manager': [
      'employees.team.view',
      'employees.team.manage',
      'employees.teamlead.assign',
      'employees.salary.view',
      'employees.salary.edit',
      'employees.payroll.view',
      'employees.payroll.edit',
      'employees.leave.assign',
      'employees.role.assign',
      'employees.login.manage',
      'employees.password.reset',
      'employees.emergency.view',
      'employees.emergency.edit',
      'employees.documents.view',
      'employees.documents.upload',
      'employees.documents.delete',
      'employees.card.view',
      'employees.card.download',
      'employees.export',
      'employees.import',
      'audit-logs.view',
    ],
    'HR Admin': [
      'employees.team.view',
      'employees.team.manage',
      'employees.teamlead.assign',
      'employees.salary.view',
      'employees.salary.edit',
      'employees.payroll.view',
      'employees.payroll.edit',
      'employees.leave.assign',
      'employees.role.assign',
      'employees.login.manage',
      'employees.password.reset',
      'employees.emergency.view',
      'employees.emergency.edit',
      'employees.documents.view',
      'employees.documents.upload',
      'employees.documents.delete',
      'employees.card.view',
      'employees.card.download',
      'employees.export',
      'employees.import',
      'audit-logs.view',
    ],
    'Team Lead': [
      'employees.team.view',
      'employees.card.view',
      'employees.emergency.view',
    ],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, description] of SeedEmployeeManagementPermissions1786900000000
      .PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      SeedEmployeeManagementPermissions1786900000000.MATRIX,
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

    // The base employees.* set was seeded for HR roles by SeedThreeRoleRbac,
    // but a Team Lead cannot open a team member's record without
    // employees.view — the team list would render and every row would 403.
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
       SELECT r."role_id", p."permission_id"
       FROM "roles" r
       CROSS JOIN "permissions" p
       WHERE r."role_name" = 'Team Lead'
         AND p."permission_name" = 'employees.view'
         AND NOT EXISTS (
           SELECT 1 FROM "role_permissions" rp
           WHERE rp."role_id" = r."role_id"
             AND rp."permission_id" = p."permission_id"
         )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const names = SeedEmployeeManagementPermissions1786900000000.PERMISSIONS.map(
      ([name]) => name,
    );

    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "permissions" p
       WHERE rp."permission_id" = p."permission_id"
         AND p."permission_name" = ANY($1::varchar[])`,
      [names],
    );

    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = ANY($1::varchar[])`,
      [names],
    );

    // Revoke only the Team Lead grant added above. `employees.view` itself is
    // owned by SeedThreeRoleRbac and must survive this rollback.
    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "roles" r, "permissions" p
       WHERE rp."role_id" = r."role_id"
         AND rp."permission_id" = p."permission_id"
         AND r."role_name" = 'Team Lead'
         AND p."permission_name" = 'employees.view'`,
    );
  }
}
