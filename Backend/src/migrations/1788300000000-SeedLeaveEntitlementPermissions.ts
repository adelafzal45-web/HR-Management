import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds permissions for the new Leave Entitlement / Leave History / Holidays
 * modules and grants them to the roles that already own leave/attendance
 * administration (mirrors the matrix in SeedWorkingDaysPermissions).
 *
 * Team Lead gets view-only on entitlements and history (to answer "how much
 * leave does my report have left") but not manage — granting/adjusting
 * balances is an HR/Admin action.
 */
export class SeedLeaveEntitlementPermissions1788300000000
  implements MigrationInterface
{
  name = 'SeedLeaveEntitlementPermissions1788300000000';

  private static readonly PERMISSIONS: Array<[string, string]> = [
    ['leave-entitlement.view', 'View leave entitlements and balance previews'],
    [
      'leave-entitlement.manage',
      'Create, update, increase, and deduct leave entitlements (single, bulk, department, designation)',
    ],
    ['leave-history.view', 'View the leave history/audit ledger'],
    ['holiday.view', 'View the company holiday calendar'],
    ['holiday.manage', 'Create, update, and delete holidays'],
  ];

  private static readonly MATRIX: Record<string, string[]> = {
    Admin: [
      'leave-entitlement.view',
      'leave-entitlement.manage',
      'leave-history.view',
      'holiday.view',
      'holiday.manage',
    ],
    'HR Manager': [
      'leave-entitlement.view',
      'leave-entitlement.manage',
      'leave-history.view',
      'holiday.view',
      'holiday.manage',
    ],
    'HR Admin': [
      'leave-entitlement.view',
      'leave-entitlement.manage',
      'leave-history.view',
      'holiday.view',
      'holiday.manage',
    ],
    'Team Lead': ['leave-entitlement.view', 'leave-history.view', 'holiday.view'],
    Employee: ['holiday.view'],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [
      name,
      description,
    ] of SeedLeaveEntitlementPermissions1788300000000.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      SeedLeaveEntitlementPermissions1788300000000.MATRIX,
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
    const names = SeedLeaveEntitlementPermissions1788300000000.PERMISSIONS.map(
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