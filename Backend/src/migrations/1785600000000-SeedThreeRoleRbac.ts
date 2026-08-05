import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the three-role appraisal RBAC model.
 *
 * Before this migration the `roles` and `permissions` tables were empty, which
 * meant every `@RequirePermission(...)` string in the codebase was
 * unsatisfiable — `AuthorizationService.hasPermission()` matches on exact
 * permission_name equality, so with no rows nobody could pass any guard.
 * (The Team Lead grant in 1785500000000 was a silent no-op for the same
 * reason: it CROSS JOINs two empty tables.)
 *
 * Roles:
 *   HR Admin  — owns forms, questions, weights, assignment, and all analytics.
 *   Team Lead — reviews assigned employees; reads forms but never edits them.
 *   Employee  — reads only their own evaluation history.
 *
 * Idempotent: re-running inserts nothing new and changes no existing grant.
 */
export class SeedThreeRoleRbac1785600000000 implements MigrationInterface {
  name = 'SeedThreeRoleRbac1785600000000';

  /**
   * The permission vocabulary this migration owns.
   *
   * Originally this was appraisal-only, which left ~30 of the
   * `@RequirePermission(...)` strings enforced elsewhere in the codebase with
   * no matching row — on a fresh database those routes were unreachable by
   * everyone, because `AuthorizationService.hasPermission()` matches on exact
   * permission_name equality. (The live database had them only because they
   * were inserted by hand.) The non-appraisal modules are now seeded here too.
   *
   * Deliberately excluded: `departments.*`, `job-categories.*`, and
   * `notifications.*`. Those are created by
   * PermissionTaxonomyAndHrAdminGrants1786000000000, which carves them out of
   * `employees.*`; keeping them in exactly one migration keeps the rollback
   * path unambiguous.
   */
  private static readonly PERMISSIONS: Array<[string, string]> = [
    // --- Form authoring (HR/Admin only) ---
    ['appraisal-forms.create', 'Create appraisal forms'],
    ['appraisal-forms.update', 'Edit appraisal forms, questions, and weights'],
    ['appraisal-forms.delete', 'Delete or archive appraisal forms'],
    ['appraisal-forms.view', 'View appraisal forms and their questions'],
    [
      'appraisal-forms.assign',
      'Assign forms to departments, designations, or employees',
    ],
    // --- Evaluation ---
    ['appraisal.create', 'Submit an evaluation for an assigned employee'],
    ['appraisal.view', 'View evaluations for employees in scope'],
    ['appraisal.viewAll', 'View every evaluation across the organisation'],
    ['appraisal.viewOwn', 'View your own evaluations and review history'],
    // --- Employee records ---
    ['employees.view', 'View employee records'],
    ['employees.create', 'Create employee records'],
    ['employees.update', 'Edit employee records'],
    ['employees.delete', 'Delete employee records'],
    // --- Designations ---
    // Note the singular module prefix: designation.controller.ts enforces
    // 'designation.*', not 'designations.*'. Seeded to match the code.
    ['designation.view', 'View designations'],
    ['designation.create', 'Create designations'],
    ['designation.update', 'Edit designations'],
    ['designation.delete', 'Delete designations'],
    // --- Shifts ---
    ['shifts.view', 'View shifts'],
    ['shifts.create', 'Create shifts'],
    ['shifts.update', 'Edit shifts'],
    ['shifts.delete', 'Delete shifts'],
    // --- Attendance ---
    ['attendance.view', 'View attendance records'],
    ['attendance.create', 'Create attendance records'],
    ['attendance.update', 'Edit attendance records'],
    ['attendance.delete', 'Delete attendance records'],
    // --- Leave ---
    // Module prefix is 'leave-request', matching leave-request.controller.ts.
    ['leave-request.view', 'View leave requests'],
    ['leave-request.create', 'Create leave requests'],
    ['leave-request.update', 'Edit or action leave requests'],
    ['leave-request.delete', 'Delete leave requests'],
    // --- Payroll ---
    ['payroll.view', 'View payroll records'],
    ['payroll.create', 'Create payroll records'],
    ['payroll.update', 'Edit payroll records'],
    ['payroll.delete', 'Delete payroll records'],
    // --- RBAC administration (HR/Admin only) ---
    ['roles.create', 'Create roles'],
    ['roles.update', 'Edit roles and their permission grants'],
    ['roles.delete', 'Delete roles'],
    ['permissions.create', 'Create permissions'],
    ['permissions.delete', 'Delete permissions'],
  ];

  /** role_name -> permission_name[] */
  private static readonly MATRIX: Record<string, string[]> = {
    'HR Admin': [
      'appraisal-forms.create',
      'appraisal-forms.update',
      'appraisal-forms.delete',
      'appraisal-forms.view',
      'appraisal-forms.assign',
      'appraisal.view',
      'appraisal.viewAll',
      'appraisal.viewOwn',
      'employees.view',
      // HR Admin could previously see employees but not the reference data
      // every HR screen depends on, so Designations/Shifts/Leave/Payroll all
      // returned 403 and the UI surfaced "Couldn't load ...". These are reads
      // only — write access to those modules stays with Admin/HR Manager.
      // ('departments.view' is granted by 1786000000000, which owns that
      // permission.)
      'designation.view',
      'shifts.view',
      'attendance.view',
      'leave-request.view',
      'payroll.view',
      'roles.create',
      'roles.update',
      'roles.delete',
      'permissions.create',
      'permissions.delete',
    ],
    // Deliberately has NO appraisal-forms.create/.update/.delete/.assign:
    // a Team Lead must not be able to author forms, questions, or weights.
    'Team Lead': [
      'appraisal-forms.view',
      'appraisal.create',
      'appraisal.view',
      'appraisal.viewOwn',
      'employees.view',
    ],
    // Read-only, and only their own record.
    Employee: ['appraisal.viewOwn'],
  };

  private static readonly ROLE_DESCRIPTIONS: Record<string, string> = {
    'HR Admin':
      'Creates, publishes, and assigns evaluation forms; sees all evaluations and analytics.',
    'Team Lead':
      'Reviews assigned employees using published forms. Cannot author forms, questions, or weights.',
    Employee:
      'Views their own evaluations, scores, comments, and performance trends.',
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Roles
    // ------------------------------------------------------------------
    for (const [roleName, description] of Object.entries(
      SeedThreeRoleRbac1785600000000.ROLE_DESCRIPTIONS,
    )) {
      await queryRunner.query(
        `INSERT INTO "roles" ("role_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("role_name") DO NOTHING`,
        [roleName, description],
      );
    }

    // ------------------------------------------------------------------
    // 2. Permissions
    // ------------------------------------------------------------------
    for (const [
      name,
      description,
    ] of SeedThreeRoleRbac1785600000000.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    // ------------------------------------------------------------------
    // 3. Grants (role_permissions has no unique constraint, so guard with
    //    NOT EXISTS rather than ON CONFLICT)
    // ------------------------------------------------------------------
    for (const [roleName, permissionNames] of Object.entries(
      SeedThreeRoleRbac1785600000000.MATRIX,
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

    // ------------------------------------------------------------------
    // 4. Fix the 'ttendance.update' typo if a row was already created from
    //    the misspelled @RequirePermission string in attendance.controller.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      UPDATE "permissions"
      SET "permission_name" = 'attendance.update'
      WHERE "permission_name" = 'ttendance.update'
        AND NOT EXISTS (
          SELECT 1 FROM "permissions" p2
          WHERE p2."permission_name" = 'attendance.update'
        );
    `);
    // If both spellings somehow exist, drop the typo'd one and its grants.
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "permission_id" FROM "permissions"
        WHERE "permission_name" = 'ttendance.update'
      );
    `);
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = 'ttendance.update'`,
    );

    // ------------------------------------------------------------------
    // 5. Point existing users at one of the three roles.
    //    Users with no role at all become Employee — the least-privileged
    //    option, so this can never escalate anyone.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      UPDATE "users" u
      SET "role_id" = (SELECT "role_id" FROM "roles" WHERE "role_name" = 'Employee')
      WHERE u."role_id" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revoke only the grants this migration defines, for only these roles.
    for (const [roleName, permissionNames] of Object.entries(
      SeedThreeRoleRbac1785600000000.MATRIX,
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

    // Detach users before removing the roles so the FK stays satisfied.
    await queryRunner.query(`
      UPDATE "users"
      SET "role_id" = NULL
      WHERE "role_id" IN (
        SELECT "role_id" FROM "roles"
        WHERE "role_name" IN ('HR Admin', 'Team Lead', 'Employee')
      );
    `);

    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "role_name" IN ('HR Admin', 'Team Lead', 'Employee');
    `);

    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = ANY($1::varchar[])`,
      [SeedThreeRoleRbac1785600000000.PERMISSIONS.map(([name]) => name)],
    );
  }
}
