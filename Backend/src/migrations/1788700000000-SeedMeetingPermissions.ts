import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the meeting permissions and grants them per role.
 *
 * Team Leads can view and schedule meetings (they run team stand-ups and
 * one-to-ones) but not `meeting.manage`, which covers editing, cancelling and
 * deleting *any* meeting in the organisation — including one they did not
 * create. That stays with HR/Admin, mirroring how Team Leads get
 * `leave-entitlement.view` but not `.manage`.
 *
 * Employees are granted nothing on purpose: they read their own invitations
 * through `GET /meetings/me`, which is scoped to the caller and needs no
 * permission, so there is no reason to give the role org-wide meeting read.
 *
 * Structure copied from 1788300000000-SeedLeaveEntitlementPermissions, so both
 * inserts stay idempotent and re-runnable.
 */
export class SeedMeetingPermissions1788700000000 implements MigrationInterface {
  name = 'SeedMeetingPermissions1788700000000';

  private static readonly PERMISSIONS: Array<[string, string]> = [
    ['meeting.view', 'View all scheduled meetings across the organisation'],
    ['meeting.create', 'Schedule meetings and invite participants'],
    [
      'meeting.manage',
      'Update, cancel, and delete any meeting, including meetings organized by others',
    ],
  ];

  private static readonly MATRIX: Record<string, string[]> = {
    Admin: ['meeting.view', 'meeting.create', 'meeting.manage'],
    'HR Manager': ['meeting.view', 'meeting.create', 'meeting.manage'],
    'HR Admin': ['meeting.view', 'meeting.create', 'meeting.manage'],
    'Team Lead': ['meeting.view', 'meeting.create'],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [
      name,
      description,
    ] of SeedMeetingPermissions1788700000000.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      SeedMeetingPermissions1788700000000.MATRIX,
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
    const names = SeedMeetingPermissions1788700000000.PERMISSIONS.map(
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
