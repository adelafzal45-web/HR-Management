import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the permission key behind the new `PATCH /permissions/:id` route.
 *
 * The Permissions module shipped with create, read and delete but no update:
 * `UpdatePermissionDto` existed and was imported by nothing, and the only way to
 * fix a typo in a permission name was to delete the row — which cascades away
 * every `role_permissions` grant that depended on it — and recreate it, silently
 * stripping the permission from every role that held it.
 *
 * The grant is keyed off `permissions.create` rather than a role-name list: a
 * role that may mint new permissions is exactly the set that should be able to
 * correct one, and deriving it means a future admin-ish role added by another
 * migration inherits this the same way it inherits the rest of the module.
 * Nothing is granted to a role that cannot already create permissions.
 */
export class SeedPermissionUpdateGrant1787800000000
  implements MigrationInterface
{
  name = 'SeedPermissionUpdateGrant1787800000000';

  private static readonly PERMISSION = 'permissions.update';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("permission_name", "description")
       VALUES ($1, 'Rename a permission or edit its description')
       ON CONFLICT ("permission_name") DO NOTHING`,
      [SeedPermissionUpdateGrant1787800000000.PERMISSION],
    );

    // `role_permissions` has no unique constraint on (role_id, permission_id),
    // so the NOT EXISTS guard — not ON CONFLICT — is what makes this idempotent.
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
       SELECT r."role_id", p."permission_id"
       FROM "roles" r
       CROSS JOIN "permissions" p
       WHERE p."permission_name" = $1
         AND EXISTS (
           SELECT 1
           FROM "role_permissions" rp
           JOIN "permissions" creator
             ON creator."permission_id" = rp."permission_id"
           WHERE rp."role_id" = r."role_id"
             AND creator."permission_name" = 'permissions.create'
         )
         AND NOT EXISTS (
           SELECT 1 FROM "role_permissions" existing
           WHERE existing."role_id" = r."role_id"
             AND existing."permission_id" = p."permission_id"
         )`,
      [SeedPermissionUpdateGrant1787800000000.PERMISSION],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Deleting the permission row cascades its role_permissions grants
    // (FK_17022daf3f885f7d35423e9971e is ON DELETE CASCADE), so this is the
    // whole reversal.
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = $1`,
      [SeedPermissionUpdateGrant1787800000000.PERMISSION],
    );
  }
}
