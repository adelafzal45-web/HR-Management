import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the Employee role load the leave-type catalog for the Apply Leave form.
 *
 * Without `leave-types.view`, `GET /leave-types` 403s for an employee, so the
 * Leave Type dropdown cannot be populated with real `leave_type_id` UUIDs —
 * and a request submitted without one can never be approved, because balance
 * deduction keys off that FK (see `applyApproval` in leave-requests.service).
 *
 * Only the catalog read is granted. `leave-request.view` and
 * `leave-request.create` are deliberately NOT granted to Employee: both are
 * org-wide (findAll returns every employee's requests, and the create body
 * carries an arbitrary user_id), so granting them would leak the whole
 * company's leave data and let anyone file leave against anyone else's
 * balance. Employees use the token-scoped `GET/POST /leave-requests/me`
 * routes instead, which need no permission beyond a valid JWT.
 *
 * This is a separate migration rather than an edit to SeedThreeRoleRbac
 * because that one is already recorded as executed on live databases (so it
 * would never re-run) and it predates the `leave-types.view` permission,
 * which is created later by SeedSettingsPermissions1786400000000.
 */
export class GrantEmployeeLeaveTypeRead1788500000000
  implements MigrationInterface
{
  name = 'GrantEmployeeLeaveTypeRead1788500000000';

  private static readonly ROLE = 'Employee';
  private static readonly PERMISSIONS = ['leave-types.view'];

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      [
        GrantEmployeeLeaveTypeRead1788500000000.ROLE,
        GrantEmployeeLeaveTypeRead1788500000000.PERMISSIONS,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revokes the grant only. The permission row itself belongs to
    // SeedSettingsPermissions1786400000000 and is left alone.
    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "roles" r, "permissions" p
       WHERE rp."role_id" = r."role_id"
         AND rp."permission_id" = p."permission_id"
         AND r."role_name" = $1
         AND p."permission_name" = ANY($2::varchar[])`,
      [
        GrantEmployeeLeaveTypeRead1788500000000.ROLE,
        GrantEmployeeLeaveTypeRead1788500000000.PERMISSIONS,
      ],
    );
  }
}
