import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an administrator actually evaluate the employees they can now reach.
 *
 * `AppraisalFacadeService.resolveEvaluableEmployeeIds` widens the roster to the
 * whole active organisation for holders of `appraisal.viewAll`. That widening is
 * inert on its own: `POST /appraisal/evaluate/:employeeId` gates on
 * `appraisal.create`, and the only role ever granted that key is Team Lead
 * (SeedThreeRoleRbac, and again in AppraisalVerticalFixes). HR Admin could see
 * every evaluation and author every form, but could not submit one — so without
 * this grant the widened scope would resolve a full roster and then 403 on the
 * first submission.
 *
 * `appraisal.view` rides along because the two screens that lead to a submission
 * — `GET /appraisal/my-team` and `GET /appraisal/evaluate/:employeeId` — gate on
 * it. Granting create without view produces a reviewer who can post an
 * evaluation but cannot open the form to write it.
 *
 * The grant is keyed off `appraisal.viewAll` rather than a hard-coded role list
 * because that permission is what the service tests. Naming roles here instead
 * would mean a fourth admin-ish role added later gets org-wide reach from the
 * service and a 403 from the guard, which reads as the feature being broken for
 * that role alone. Nothing is granted to a role that does not already hold
 * `appraisal.viewAll`, so Team Lead and Employee are untouched.
 */
export class GrantOrgWideEvaluation1787700000000 implements MigrationInterface {
  name = 'GrantOrgWideEvaluation1787700000000';

  private static readonly GRANTS = ['appraisal.create', 'appraisal.view'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
       SELECT r."role_id", p."permission_id"
       FROM "roles" r
       CROSS JOIN "permissions" p
       WHERE p."permission_name" = ANY($1::varchar[])
         AND EXISTS (
           SELECT 1
           FROM "role_permissions" rp
           JOIN "permissions" viewall
             ON viewall."permission_id" = rp."permission_id"
           WHERE rp."role_id" = r."role_id"
             AND viewall."permission_name" = 'appraisal.viewAll'
         )
         AND NOT EXISTS (
           SELECT 1 FROM "role_permissions" existing
           WHERE existing."role_id" = r."role_id"
             AND existing."permission_id" = p."permission_id"
         )`,
      [GrantOrgWideEvaluation1787700000000.GRANTS],
    );
  }

  /**
   * Only the rows this migration could have created: a role that holds
   * `appraisal.viewAll`. Team Lead holds `appraisal.create` from
   * SeedThreeRoleRbac and has no `appraisal.viewAll`, so it is excluded from
   * this delete and keeps the key it came in with.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "permissions" p
       WHERE rp."permission_id" = p."permission_id"
         AND p."permission_name" = ANY($1::varchar[])
         AND EXISTS (
           SELECT 1
           FROM "role_permissions" other
           JOIN "permissions" viewall
             ON viewall."permission_id" = other."permission_id"
           WHERE other."role_id" = rp."role_id"
             AND viewall."permission_name" = 'appraisal.viewAll'
         )`,
      [GrantOrgWideEvaluation1787700000000.GRANTS],
    );
  }
}
