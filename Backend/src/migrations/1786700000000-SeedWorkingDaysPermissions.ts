import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the `working-days.*` permission set and grants it to the roles that
 * configure the Settings workspace.
 *
 * Read access is broader than write: Team Lead needs to see which days are
 * working days to interpret their team's attendance, but must not redefine the
 * company calendar.
 */
export class SeedWorkingDaysPermissions1786700000000
  implements MigrationInterface
{
  name = 'SeedWorkingDaysPermissions1786700000000';

  private static readonly PERMISSIONS: Array<[string, string]> = [
    ['working-days.view', 'View working day configuration'],
    ['working-days.update', 'Configure working days globally and per scope'],
  ];

  private static readonly MATRIX: Record<string, string[]> = {
    Admin: ['working-days.view', 'working-days.update'],
    'HR Manager': ['working-days.view', 'working-days.update'],
    'HR Admin': ['working-days.view', 'working-days.update'],
    'Team Lead': ['working-days.view'],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, description] of SeedWorkingDaysPermissions1786700000000
      .PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      SeedWorkingDaysPermissions1786700000000.MATRIX,
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
    const names = SeedWorkingDaysPermissions1786700000000.PERMISSIONS.map(
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
