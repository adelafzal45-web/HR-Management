import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Revokes form/question authoring permissions from Team Lead, and gives the two
 * legacy HR-ish roles the appraisal read/assign keys they are missing.
 *
 * Why this is needed: the audit behind 1785600000000-SeedThreeRoleRbac assumed
 * the grant block in 1785500000000-AppraisalVerticalFixes:73-98 was a no-op
 * because it CROSS JOINs `roles` x `permissions`. That assumption was wrong --
 * both tables already held a legacy RBAC set (roles Admin / HR Manager /
 * Finance, created outside any migration in this repo), so the block executed
 * and granted Team Lead:
 *
 *   appraisal-forms.create / .update
 *   appraisal-form-questions.create / .update
 *   apprisal-question.create / .update      (sic - legacy misspelling)
 *
 * SeedThreeRoleRbac only inserts missing grants and never revokes, so those
 * survived. They contradict the requirement that a Team Lead "cannot create or
 * edit forms, questions, or weights": with them, POST /appraisal/forms and
 * PUT /appraisal/forms/:formId/questions return 201/200 for a Lead, not 403.
 *
 * Idempotent: the DELETE is a no-op once applied, the INSERT is guarded by
 * NOT EXISTS. Reversible: down() restores every row this removes.
 */
export class RevokeLeadAuthoringGrants1785900000000
  implements MigrationInterface
{
  name = 'RevokeLeadAuthoringGrants1785900000000';

  /**
   * Authoring keys a reviewer must never hold.
   *
   * `appraisal.update` is included because it lets a Lead overwrite an already
   * submitted review. No route reads it today (POST /appraisal/evaluate/:id
   * gates on `appraisal.create`), so removing it changes no current behaviour.
   *
   * The `.view` / `.view.own` variants of these same resources are dropped too:
   * they are dead keys guarding controllers that no longer exist. The Lead reads
   * the rubric through `appraisal-forms.view`, which is deliberately kept.
   */
  private static readonly LEAD_REVOKE = [
    'appraisal-forms.create',
    'appraisal-forms.update',
    'appraisal-forms.view.own',
    'appraisal-form-questions.create',
    'appraisal-form-questions.update',
    'appraisal-form-questions.view',
    'appraisal-form-questions.view.own',
    'apprisal-question.create',
    'apprisal-question.update',
    'apprisal-question.view',
    'apprisal-question.view.own',
    'appraisal.update',
  ];

  /**
   * Legacy roles the frontend routes to the HR screens (ROLES.ADMINISTRATOR /
   * ROLES.HR_MANAGER). They predate this repo's migrations and hold 4 of the 47
   * users. They lack the two keys the facade's assignment and analytics routes
   * require, so those routes 403 for them today.
   *
   * Additive only. Nothing is revoked from these roles: `Admin` is the 54-grant
   * superuser and narrowing it is out of scope here.
   */
  private static readonly LEGACY_HR_ROLES = ['Admin', 'HR Manager'];

  private static readonly LEGACY_HR_ADD = [
    'appraisal.viewAll',
    'appraisal.viewOwn',
    'appraisal-forms.assign',
    'appraisal-forms.delete',
  ];

  /** DELETE role_permissions for $1 = role names, $2 = permission names. */
  private static readonly REVOKE_SQL = `
    DELETE FROM "role_permissions" rp
    USING "roles" r, "permissions" p
    WHERE rp."role_id" = r."role_id"
      AND rp."permission_id" = p."permission_id"
      AND r."role_name" = ANY($1::varchar[])
      AND p."permission_name" = ANY($2::varchar[]);
  `;

  /** INSERT role_permissions for $1 = role names, $2 = permission names. */
  private static readonly GRANT_SQL = `
    INSERT INTO "role_permissions" ("role_id", "permission_id")
    SELECT r."role_id", p."permission_id"
    FROM "roles" r
    CROSS JOIN "permissions" p
    WHERE r."role_name" = ANY($1::varchar[])
      AND p."permission_name" = ANY($2::varchar[])
      AND NOT EXISTS (
        SELECT 1 FROM "role_permissions" rp
        WHERE rp."role_id" = r."role_id"
          AND rp."permission_id" = p."permission_id"
      );
  `;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const C = RevokeLeadAuthoringGrants1785900000000;

    // 1. Team Lead loses every authoring key. Kept: appraisal-forms.view,
    //    appraisal.create / .view / .viewOwn, employees.view -- the reviewing
    //    path. Untouched: attendance.*, leave-request.*, MANAGE_SHIFTS,
    //    APPROVE_LEAVE, VIEW_REPORTS (unrelated team-management features).
    await queryRunner.query(C.REVOKE_SQL, [['Team Lead'], C.LEAD_REVOKE]);

    // 2. Legacy HR/Admin roles gain the assignment + org-wide read keys.
    await queryRunner.query(C.GRANT_SQL, [C.LEGACY_HR_ROLES, C.LEGACY_HR_ADD]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const C = RevokeLeadAuthoringGrants1785900000000;

    await queryRunner.query(C.GRANT_SQL, [['Team Lead'], C.LEAD_REVOKE]);
    await queryRunner.query(C.REVOKE_SQL, [
      C.LEGACY_HR_ROLES,
      C.LEGACY_HR_ADD,
    ]);
  }
}
