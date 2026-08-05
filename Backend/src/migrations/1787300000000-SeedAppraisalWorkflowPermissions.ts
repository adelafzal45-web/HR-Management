import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the appraisal workflow permissions and backfills Team Lead visibility.
 *
 * Naming extends the two namespaces that already exist — `appraisal.*` for the
 * review workflow and `appraisal-forms.*` for authoring (seeded by
 * SeedThreeRoleRbac). No third prefix: two names for the same thing guarantees
 * a guard eventually checks the one that was never granted.
 *
 * `appraisal.submit` is granted *alongside* the existing `appraisal.create`
 * rather than replacing it, so a token issued before this migration keeps
 * working.
 *
 * The Team Lead backfill is the reason this migration is not purely additive.
 * Team Lead visibility used to be "every active member of my department",
 * computed on the fly. It is now an explicit `team_lead_assignments` row, so
 * without a backfill every existing lead would open their dashboard after
 * deploy and see an empty team. Each lead therefore gets a DEPARTMENT-mode row
 * for the department they are in — identical to what they could see before.
 * Narrowing a lead to specific members is a deliberate HR action afterwards.
 */
export class SeedAppraisalWorkflowPermissions1787300000000
  implements MigrationInterface
{
  name = 'SeedAppraisalWorkflowPermissions1787300000000';

  private static readonly PERMISSIONS: Array<[string, string]> = [
    ['appraisal.submit', 'Submit an evaluation for an assigned employee'],
    ['appraisal.approve', 'Approve, reject or reopen a submitted evaluation'],
    ['appraisal.stats', 'View appraisal statistics and dashboards'],
    ['appraisal.compare', 'Compare appraisal statistics across employees'],
    ['appraisal.export', 'Export appraisal data to PDF or Excel'],
    [
      'appraisal-forms.questions.manage',
      'Create and edit reusable appraisal questions in the question bank',
    ],
    [
      'appraisal.teamlead.assign',
      'Assign employees or a whole department to a Team Lead',
    ],
  ];

  /**
   * Team Lead gets submit, plus stats and export — both of which are scoped in
   * the service layer to the lead's own resolved roster, never org-wide.
   *
   * Team Lead deliberately does NOT get `appraisal.approve`: a lead approving
   * their own submission would make the lock meaningless. Nor `.compare`, which
   * ranks employees across departments.
   *
   * Employee appears nowhere. Employees read their own records through
   * `appraisal.viewOwn`, which SeedThreeRoleRbac already grants.
   */
  private static readonly MATRIX: Record<string, string[]> = {
    Admin: [
      'appraisal.submit',
      'appraisal.approve',
      'appraisal.stats',
      'appraisal.compare',
      'appraisal.export',
      'appraisal-forms.questions.manage',
      'appraisal.teamlead.assign',
    ],
    'HR Manager': [
      'appraisal.submit',
      'appraisal.approve',
      'appraisal.stats',
      'appraisal.compare',
      'appraisal.export',
      'appraisal-forms.questions.manage',
      'appraisal.teamlead.assign',
    ],
    'HR Admin': [
      'appraisal.submit',
      'appraisal.approve',
      'appraisal.stats',
      'appraisal.compare',
      'appraisal.export',
      'appraisal-forms.questions.manage',
      'appraisal.teamlead.assign',
    ],
    'Team Lead': ['appraisal.submit', 'appraisal.stats', 'appraisal.export'],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [
      name,
      description,
    ] of SeedAppraisalWorkflowPermissions1787300000000.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      SeedAppraisalWorkflowPermissions1787300000000.MATRIX,
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
    // Backfill DEPARTMENT-mode assignments for every existing Team Lead.
    // `users.role_id` is a direct FK — there is no user_roles join table.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "team_lead_assignments" ("team_lead_id", "mode", "department_id")
      SELECT u."user_id", 'DEPARTMENT', u."department_id"
      FROM "users" u
      JOIN "roles" r ON r."role_id" = u."role_id"
      WHERE r."role_name" = 'Team Lead'
        AND u."department_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "team_lead_assignments" t
          WHERE t."team_lead_id" = u."user_id"
            AND t."mode" = 'DEPARTMENT'
        );
    `);

    // ------------------------------------------------------------------
    // 12th mail template: the pending-appraisal shift reminder. None of the
    // 11 seeded by CreateMailInfrastructure fits, and MailService.enqueue
    // skips silently on a missing key — so without this row the reminder
    // would never send and nothing would report why.
    // ------------------------------------------------------------------
    await queryRunner.query(
      `INSERT INTO "email_templates"
         ("template_key", "name", "subject", "body_html", "enabled")
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT ("template_key") DO NOTHING`,
      [
        'appraisal_pending_reminder',
        'Appraisal Pending Reminder',
        'Reminder: {{pending_count}} appraisal(s) pending before shift end',
        [
          '<p>Hi {{employee_name}},</p>',
          '<p>Your shift ends at {{shift_end_time}} and you still have',
          '<strong>{{pending_count}}</strong> appraisal form(s) awaiting submission',
          'for {{review_date}}.</p>',
          '<p>Please complete them before the end of your shift.</p>',
          '<p><a href="{{login_url}}">Open your appraisal dashboard</a></p>',
          '<p>&mdash; {{company_name}}</p>',
        ].join('\n'),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "email_templates" WHERE "template_key" = 'appraisal_pending_reminder'`,
    );

    // Only the rows this migration created. A DEPARTMENT row HR has since
    // edited is indistinguishable from a backfilled one, so scope the delete
    // to leads that have no MEMBERS assignment — i.e. untouched since deploy.
    await queryRunner.query(`
      DELETE FROM "team_lead_assignments" t
      WHERE t."mode" = 'DEPARTMENT'
        AND NOT EXISTS (
          SELECT 1 FROM "team_lead_assignments" o
          WHERE o."team_lead_id" = t."team_lead_id"
            AND o."mode" = 'MEMBERS'
        );
    `);

    const names = SeedAppraisalWorkflowPermissions1787300000000.PERMISSIONS.map(
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
