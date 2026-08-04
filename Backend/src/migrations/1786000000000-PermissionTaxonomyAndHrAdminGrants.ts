import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Splits the overloaded `employees.*` permissions into per-module sets and
 * fills in the view grants HR Admin was missing.
 *
 * Background: `departments`, `job-categories`, and `notifications` all gated
 * their routes on `employees.*` rather than owning a permission set. That made
 * the vocabulary lie about what a grant actually unlocks — `employees.view`
 * silently also meant "read every department, job category, and notification" —
 * and it's why Departments happened to work for HR Admin (it holds
 * `employees.view`) while Designations and Shifts 403'd.
 *
 * Step 2 is a pure rename: every role that could reach those routes before can
 * still reach them, because the new grant is derived from the old one. No role
 * gains or loses access here. Step 3 is the deliberate part — the view
 * permissions HR Admin should have had all along.
 *
 * Idempotent: re-running inserts nothing new and revokes nothing.
 */
export class PermissionTaxonomyAndHrAdminGrants1786000000000
  implements MigrationInterface
{
  name = 'PermissionTaxonomyAndHrAdminGrants1786000000000';

  /** New per-module permissions carved out of `employees.*`. */
  private static readonly NEW_PERMISSIONS: Array<[string, string]> = [
    ['departments.create', 'Create departments'],
    ['departments.view', 'View departments'],
    ['departments.update', 'Edit departments'],
    ['departments.delete', 'Delete departments'],

    ['job-categories.create', 'Create job categories'],
    ['job-categories.view', 'View job categories'],
    ['job-categories.update', 'Edit job categories'],
    ['job-categories.delete', 'Delete job categories'],

    ['notifications.create', 'Create notifications'],
    ['notifications.view', 'View notifications'],
    ['notifications.update', 'Edit notifications'],
    ['notifications.delete', 'Delete notifications'],
  ];

  /** Modules whose grants are derived from the matching `employees.<action>`. */
  private static readonly CARVED_MODULES = [
    'departments',
    'job-categories',
    'notifications',
  ];

  private static readonly ACTIONS = ['create', 'view', 'update', 'delete'];

  /**
   * Views HR Admin was missing. It administers the Settings workspace, so it
   * needs to read the org data it manages.
   *
   * Note: the leave module's permission is `leave-request.view` (not
   * `leave.view`) — that's the name every leave route already enforces, so we
   * grant the existing one rather than introduce a near-duplicate.
   */
  private static readonly HR_ADMIN_ADDITIONAL_VIEWS = [
    'departments.view',
    'designation.view',
    'shifts.view',
    'attendance.view',
    'payroll.view',
    'leave-request.view',
    'job-categories.view',
    'notifications.view',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Create the new permission rows.
    // ------------------------------------------------------------------
    for (const [name, description] of PermissionTaxonomyAndHrAdminGrants1786000000000.NEW_PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    // ------------------------------------------------------------------
    // 2. Behaviour-preserving carve-out: grant `<module>.<action>` to every
    //    role that currently holds `employees.<action>`.
    //
    //    `role_permissions` has no unique constraint on
    //    (role_id, permission_id), so guard with NOT EXISTS rather than
    //    ON CONFLICT.
    // ------------------------------------------------------------------
    for (const module of PermissionTaxonomyAndHrAdminGrants1786000000000.CARVED_MODULES) {
      for (const action of PermissionTaxonomyAndHrAdminGrants1786000000000.ACTIONS) {
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id")
           SELECT rp."role_id", target."permission_id"
           FROM "role_permissions" rp
           JOIN "permissions" source
             ON source."permission_id" = rp."permission_id"
            AND source."permission_name" = $1
           CROSS JOIN "permissions" target
           WHERE target."permission_name" = $2
             AND NOT EXISTS (
               SELECT 1 FROM "role_permissions" existing
               WHERE existing."role_id" = rp."role_id"
                 AND existing."permission_id" = target."permission_id"
             )`,
          [`employees.${action}`, `${module}.${action}`],
        );
      }
    }

    // ------------------------------------------------------------------
    // 3. Grant HR Admin the view permissions it was missing.
    //    Only touches permissions that actually exist, so a name that isn't
    //    seeded yet is skipped rather than failing the migration.
    // ------------------------------------------------------------------
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
       SELECT r."role_id", p."permission_id"
       FROM "roles" r
       CROSS JOIN "permissions" p
       WHERE r."role_name" = 'HR Admin'
         AND p."permission_name" = ANY($1::varchar[])
         AND NOT EXISTS (
           SELECT 1 FROM "role_permissions" rp
           WHERE rp."role_id" = r."role_id"
             AND rp."permission_id" = p."permission_id"
         )`,
      [PermissionTaxonomyAndHrAdminGrants1786000000000.HR_ADMIN_ADDITIONAL_VIEWS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const newNames =
      PermissionTaxonomyAndHrAdminGrants1786000000000.NEW_PERMISSIONS.map(
        ([name]) => name,
      );

    // Drop grants for the carved-out permissions, then the permissions
    // themselves. The routes revert to `employees.*`, which every affected
    // role still holds, so access is restored exactly as it was.
    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "permissions" p
       WHERE rp."permission_id" = p."permission_id"
         AND p."permission_name" = ANY($1::varchar[])`,
      [newNames],
    );

    // Revoke only the HR Admin views this migration added that belong to
    // other modules (the carved ones are already gone above).
    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "roles" r, "permissions" p
       WHERE rp."role_id" = r."role_id"
         AND rp."permission_id" = p."permission_id"
         AND r."role_name" = 'HR Admin'
         AND p."permission_name" = ANY($1::varchar[])`,
      [
        [
          'designation.view',
          'shifts.view',
          'attendance.view',
          'payroll.view',
          'leave-request.view',
        ],
      ],
    );

    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = ANY($1::varchar[])`,
      [newNames],
    );
  }
}
