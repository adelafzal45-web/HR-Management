import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Slack integration configuration.
 *
 * A single-row table with a CHECK constraint pinning id = 1, exactly like
 * `smtp_settings` / `company_settings`. There is one Slack workspace credential
 * per deployment; modelling it as a table of many rows would invite the question
 * of which row is live.
 *
 * The bot token column is named `bot_token_encrypted` rather than `bot_token` so
 * that a future reader cannot mistake it for something they can read directly,
 * and so the audit service's redaction (which matches on field names containing
 * 'token') catches it. The value is AES-256-GCM ciphertext (see
 * `slack/slack-crypto.ts`).
 */
export class CreateSlackIntegration1789400000007
  implements MigrationInterface
{
  name = 'CreateSlackIntegration1789400000007';

  /**
   * Permissions for the Slack settings surface.
   *
   * Follows the mail module's `email-settings.*` shape. Sending a test message
   * is separated from updating settings because it causes an outbound side
   * effect using the configured token, which is a different act from editing a
   * form.
   */
  private static readonly PERMISSIONS: Array<[string, string]> = [
    ['slack-settings.view', 'View Slack integration configuration'],
    ['slack-settings.update', 'Change Slack integration configuration'],
    ['slack-settings.test', 'Send a test message using the Slack configuration'],
  ];

  /** Roles that administer integrations. Deliberately not Team Lead or Employee. */
  private static readonly GRANTED_ROLES = [
    'Admin',
    'Administrator',
    'Super Admin',
    'HR Admin',
    'HR Manager',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "slack_settings" (
        "id" integer NOT NULL DEFAULT 1,
        "bot_token_encrypted" text,
        "default_channel" character varying(255),
        "enabled" boolean NOT NULL DEFAULT false,
        "last_test_at" TIMESTAMP WITH TIME ZONE,
        "last_test_ok" boolean,
        "last_test_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_slack_settings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_slack_settings_single_row" CHECK ("id" = 1)
      )
    `);

    // Seeded disabled with no token: Slack is opt-in, and the lazy getOrCreate()
    // in the service would create this row anyway — seeding it here is
    // belt-and-suspenders so the row exists the moment the table does.
    await queryRunner.query(`
      INSERT INTO "slack_settings" ("id", "enabled")
      VALUES (1, false)
    `);

    await this.seedPermissions(queryRunner);
  }

  private async seedPermissions(queryRunner: QueryRunner): Promise<void> {
    for (const [
      name,
      description,
    ] of CreateSlackIntegration1789400000007.PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    const roles = CreateSlackIntegration1789400000007.GRANTED_ROLES;
    const permissionNames =
      CreateSlackIntegration1789400000007.PERMISSIONS.map(([name]) => name);

    // Joins through by name so the grant lands on whichever of the role aliases
    // this database actually has, and is a no-op for the ones it does not.
    //
    // Guarded with NOT EXISTS rather than ON CONFLICT: `role_permissions` has no
    // unique constraint on (role_id, permission_id) — its only key is the
    // surrogate `role_permission_id` — so ON CONFLICT has nothing to match and
    // re-running would insert duplicate grants. Same approach as the mail
    // migration.
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
       SELECT r."role_id", p."permission_id"
       FROM "roles" r
       CROSS JOIN "permissions" p
       WHERE r."role_name" = ANY($1::varchar[])
         AND p."permission_name" = ANY($2::varchar[])
         AND NOT EXISTS (
           SELECT 1 FROM "role_permissions" rp
           WHERE rp."role_id" = r."role_id"
             AND rp."permission_id" = p."permission_id"
         )`,
      [roles, permissionNames],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionNames =
      CreateSlackIntegration1789400000007.PERMISSIONS.map(([name]) => name);

    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "permissions" p
       WHERE rp."permission_id" = p."permission_id"
         AND p."permission_name" = ANY($1::varchar[])`,
      [permissionNames],
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = ANY($1::varchar[])`,
      [permissionNames],
    );

    await queryRunner.query(`DROP TABLE "slack_settings"`);
  }
}
