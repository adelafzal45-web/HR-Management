import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  DEFAULT_EMAIL_TEMPLATES,
} from '../mail/templates/default-templates';

/**
 * Mail infrastructure: SMTP configuration, managed templates with version
 * history, and the outbound queue.
 *
 * Four tables, and the reasoning behind the shape of each:
 *
 *   - `smtp_settings` is a single-row table with a CHECK constraint pinning
 *     id = 1, exactly like `company_settings`. There is one mail server per
 *     deployment; modelling it as a table of many rows would invite the
 *     question of which row is live.
 *   - `email_templates` holds the current version of each template.
 *     `email_template_versions` is append-only history. Keeping history in a
 *     separate table means the hot read path (render one template) never has to
 *     filter for "the latest", which is where this kind of design usually goes
 *     wrong.
 *   - `email_queue` is the outbox. Rendering happens at enqueue time and the
 *     result is stored, so the message that eventually leaves is the one that
 *     was composed — a template edited between enqueue and send does not
 *     retroactively change mail already in flight.
 *
 * The SMTP password column is named `password_encrypted` rather than `password`
 * so that a future reader cannot mistake it for something they can read
 * directly, and so the audit service's redaction (which matches on field names
 * containing 'password') catches it.
 */
export class CreateMailInfrastructure1787100000000
  implements MigrationInterface
{
  name = 'CreateMailInfrastructure1787100000000';

  /**
   * Permissions for the mail surfaces.
   *
   * Follows the existing `company-settings.*` naming rather than inventing a new
   * shape. Sending a test email is separated from updating settings because it
   * causes an outbound side effect using the configured credentials, which is a
   * different act from editing a form.
   */
  private static readonly PERMISSIONS: Array<[string, string]> = [
    ['email-settings.view', 'View SMTP configuration'],
    ['email-settings.update', 'Change SMTP configuration'],
    ['email-settings.test', 'Send a test email using the SMTP configuration'],
    ['email-templates.view', 'View email templates'],
    ['email-templates.update', 'Edit, enable, disable and restore email templates'],
    ['email-queue.view', 'View the outbound email queue and delivery status'],
    ['email-queue.manage', 'Retry or cancel queued emails'],
  ];

  /** Roles that administer mail. Deliberately not Team Lead or Employee. */
  private static readonly GRANTED_ROLES = [
    'Admin',
    'Administrator',
    'Super Admin',
    'HR Admin',
    'HR Manager',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "smtp_settings" (
        "id" integer NOT NULL DEFAULT 1,
        "host" character varying(255),
        "port" integer NOT NULL DEFAULT 587,
        "username" character varying(255),
        "password_encrypted" text,
        "encryption" character varying(10) NOT NULL DEFAULT 'tls',
        "from_name" character varying(150),
        "from_email" character varying(255),
        "reply_to" character varying(255),
        "enabled" boolean NOT NULL DEFAULT false,
        "last_test_at" TIMESTAMP WITH TIME ZONE,
        "last_test_ok" boolean,
        "last_test_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_smtp_settings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_smtp_settings_single_row" CHECK ("id" = 1),
        CONSTRAINT "CHK_smtp_settings_encryption"
          CHECK ("encryption" IN ('none', 'tls', 'ssl'))
      )
    `);

    // Seeded disabled with no host: mail is opt-in, and an accidentally-enabled
    // blank configuration would queue messages that can never send.
    await queryRunner.query(`
      INSERT INTO "smtp_settings" ("id", "port", "encryption", "enabled")
      VALUES (1, 587, 'tls', false)
    `);

    await queryRunner.query(`
      CREATE TABLE "email_templates" (
        "email_template_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "template_key" character varying(60) NOT NULL,
        "name" character varying(150) NOT NULL,
        "description" text,
        "subject" character varying(255) NOT NULL,
        "body_html" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "version" integer NOT NULL DEFAULT 1,
        "updated_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_templates" PRIMARY KEY ("email_template_id"),
        CONSTRAINT "UQ_email_templates_key" UNIQUE ("template_key")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "email_templates"
      ADD CONSTRAINT "FK_email_templates_updated_by"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "email_template_versions" (
        "email_template_version_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email_template_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "subject" character varying(255) NOT NULL,
        "body_html" text NOT NULL,
        "changed_by_user_id" uuid,
        "changed_by_email" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_template_versions" PRIMARY KEY ("email_template_version_id"),
        CONSTRAINT "UQ_email_template_versions_number"
          UNIQUE ("email_template_id", "version")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "email_template_versions"
      ADD CONSTRAINT "FK_email_template_versions_template"
      FOREIGN KEY ("email_template_id")
      REFERENCES "email_templates"("email_template_id")
      ON DELETE CASCADE
    `);

    // Denormalised email alongside the FK, same reasoning as audit_logs: the
    // history stays readable after the editor's account is removed.
    await queryRunner.query(`
      ALTER TABLE "email_template_versions"
      ADD CONSTRAINT "FK_email_template_versions_changed_by"
      FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "email_queue" (
        "email_queue_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "template_key" character varying(60),
        "to_email" character varying(255) NOT NULL,
        "to_name" character varying(200),
        "subject" character varying(255) NOT NULL,
        "body_html" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 5,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_error" text,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "related_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_queue" PRIMARY KEY ("email_queue_id"),
        CONSTRAINT "CHK_email_queue_status"
          CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'cancelled'))
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "email_queue"
      ADD CONSTRAINT "FK_email_queue_related_user"
      FOREIGN KEY ("related_user_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL
    `);

    // The drain query is "pending rows whose next_attempt_at has passed,
    // oldest first" — this index is exactly that access path, and it is partial
    // so the ever-growing tail of sent rows costs nothing to skip.
    await queryRunner.query(`
      CREATE INDEX "IDX_email_queue_drain"
      ON "email_queue" ("next_attempt_at")
      WHERE "status" = 'pending'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_email_queue_status_created"
      ON "email_queue" ("status", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_email_queue_related_user"
      ON "email_queue" ("related_user_id")
    `);

    await this.seedTemplates(queryRunner);
    await this.seedPermissions(queryRunner);
  }

  /**
   * Inserts the shipped templates.
   *
   * The bodies live in `mail/templates/default-templates.ts` rather than inline
   * here so the same definitions can be used to restore a template a user has
   * edited into a broken state, instead of existing only as historical migration
   * text that nothing can read at runtime.
   *
   * `ON CONFLICT DO NOTHING` keeps this re-runnable and, more importantly, means
   * re-applying the migration on a database where an admin has already
   * customised a template does not overwrite their copy.
   */
  private async seedTemplates(queryRunner: QueryRunner): Promise<void> {
    for (const template of DEFAULT_EMAIL_TEMPLATES) {
      await queryRunner.query(
        `INSERT INTO "email_templates"
           ("template_key", "name", "description", "subject", "body_html", "enabled", "version")
         VALUES ($1, $2, $3, $4, $5, true, 1)
         ON CONFLICT ("template_key") DO NOTHING`,
        [
          template.key,
          template.name,
          template.description,
          template.subject,
          template.bodyHtml,
        ],
      );
    }
  }

  private async seedPermissions(queryRunner: QueryRunner): Promise<void> {
    for (const [name, description] of CreateMailInfrastructure1787100000000
      .PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("permission_name", "description")
         VALUES ($1, $2)
         ON CONFLICT ("permission_name") DO NOTHING`,
        [name, description],
      );
    }

    const roles = CreateMailInfrastructure1787100000000.GRANTED_ROLES;
    const permissionNames =
      CreateMailInfrastructure1787100000000.PERMISSIONS.map(([name]) => name);

    // Joins through by name so the grant lands on whichever of the role aliases
    // this database actually has, and is a no-op for the ones it does not.
    //
    // Guarded with NOT EXISTS rather than ON CONFLICT: `role_permissions` has no
    // unique constraint on (role_id, permission_id) — its only key is the
    // surrogate `role_permission_id` — so ON CONFLICT has nothing to match and
    // re-running would insert duplicate grants. Same approach as
    // SeedEmployeeManagementPermissions.
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
      CreateMailInfrastructure1787100000000.PERMISSIONS.map(([name]) => name);

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

    await queryRunner.query(`DROP TABLE "email_queue"`);
    await queryRunner.query(`DROP TABLE "email_template_versions"`);
    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`DROP TABLE "smtp_settings"`);
  }
}
