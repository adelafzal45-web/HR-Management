import { MigrationInterface, QueryRunner } from "typeorm";

import { DEFAULT_EMAIL_TEMPLATES } from "../mail/templates/default-templates";

/**
 * Seeds the two appraisal email templates.
 *
 * `1787100000000-CreateMailInfrastructure` seeded the eleven templates that
 * existed then, and it is `ON CONFLICT DO NOTHING` over a fixed list — re-running
 * it would not pick up new entries, and editing a shipped migration to add them
 * would mean already-migrated databases never receive them. Hence a new
 * migration that inserts only the keys below.
 *
 * The bodies come from `mail/templates/default-templates.ts` rather than being
 * duplicated here, for the same reason the original migration does it that way:
 * one definition, readable at runtime, so the "restore default" path in the
 * template editor and the seed can never drift apart.
 *
 * `MailService.enqueue` skips silently when a template key is missing, so the
 * cost of this migration not running is quiet non-delivery rather than an error —
 * which is exactly why it is worth the explicit `down()` below being narrow: it
 * removes only these two keys, and only if an admin has not since edited them
 * (version = 1), because deleting someone's customised template on a revert
 * would destroy work that was never ours.
 */
export class SeedAppraisalEmailTemplates1787500000000
  implements MigrationInterface
{
  name = "SeedAppraisalEmailTemplates1787500000000";

  private static readonly KEYS = [
    "appraisal_pending_reminder",
    "appraisal_status_changed",
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of SeedAppraisalEmailTemplates1787500000000.KEYS) {
      const template = DEFAULT_EMAIL_TEMPLATES.find((t) => t.key === key);
      if (!template) {
        // The definition was removed from the source list. Skip rather than
        // throw: failing a migration over a missing optional email template
        // would block every later migration behind it.
        continue;
      }

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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "email_templates"
       WHERE "template_key" = ANY($1)
         AND "version" = 1`,
      [SeedAppraisalEmailTemplates1787500000000.KEYS],
    );
  }
}
