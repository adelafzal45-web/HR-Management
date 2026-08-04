import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the permission vocabulary for the two new Settings modules
 * (`company_settings` and `leave_types`) and grants it to the roles that
 * administer the Settings workspace.
 *
 * Scope note: `GET /company-settings/branding` is deliberately NOT gated by a
 * permission — it is `@Public()`, because the login screen renders the logo and
 * the whole app themes itself from `primary_color` before any token exists. Only
 * the full record (registration number, timezone, currency, ...) sits behind
 * `company-settings.view`.
 *
 * Idempotent: `role_permissions` has no unique constraint on
 * (role_id, permission_id), so grants are guarded with NOT EXISTS rather than
 * ON CONFLICT.
 */
export class SeedSettingsPermissions1786400000000 implements MigrationInterface {
  name = 'SeedSettingsPermissions1786400000000';

  private static readonly PERMISSIONS: Array<[string, string]> = [
    ['company-settings.view', 'View company details and branding'],
    ['company-settings.update', 'Edit company details and branding'],

    ['leave-types.view', 'View leave types'],
    ['leave-types.create', 'Create leave types'],
    ['leave-types.update', 'Edit leave types'],
    ['leave-types.delete', 'Delete leave types'],
  ];

  /**
   * role_name -> permission_name[]
   *
   * Roles absent from the database are skipped rather than created — role
   * creation belongs to the seed migrations that own those roles.
   */
  private static readonly MATRIX: Record<string, string[]> = {
    Admin: [
      'company-settings.view',
      'company-settings.update',
      'leave-types.view',
      'leave-types.create',
      'leave-types.update',
      'leave-types.delete',
    ],
    'HR Manager': [
      'company-settings.view',
      'company-settings.update',
      'leave-types.view',
      'leave-types.create',
      'leave-types.update',
      'leave-types.delete',
    ],
    // HR Admin administers the Settings workspace, so it gets the full set.
    'HR Admin': [
      'company-settings.view',
      'company-settings.update',
      'leave-types.view',
      'leave-types.create',
      'leave-types.update',
      'leave-types.delete',
    ],
    // Team Leads read leave types when actioning requests, but must not edit
    // the catalog.
    'Team Lead': ['leave-types.view'],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, description] of SeedSettingsPermissions1786400000000
      .PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      SeedSettingsPermissions1786400000000.MATRIX,
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
    const names = SeedSettingsPermissions1786400000000.PERMISSIONS.map(
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
  }
}
