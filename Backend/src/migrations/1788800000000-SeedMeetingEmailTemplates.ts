import { MigrationInterface, QueryRunner } from 'typeorm';

import { DEFAULT_EMAIL_TEMPLATES } from '../mail/templates/default-templates';

/**
 * Seeds the three meeting email templates.
 *
 * A separate migration rather than an edit to 1787100000000-CreateMailInfrastructure
 * for the reason set out there: that seed is `ON CONFLICT DO NOTHING` over a
 * fixed list, so already-migrated databases would never receive new keys.
 *
 * Bodies are imported from `mail/templates/default-templates.ts` rather than
 * duplicated, keeping the seed and the template editor's "restore default" path
 * reading from one definition.
 *
 * `down()` deletes only rows still at `version = 1` — if an admin has since
 * edited a template, reverting this migration must not destroy their copy.
 */
export class SeedMeetingEmailTemplates1788800000000
  implements MigrationInterface
{
  name = 'SeedMeetingEmailTemplates1788800000000';

  private static readonly KEYS = [
    'meeting_invitation',
    'meeting_updated',
    'meeting_cancelled',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of SeedMeetingEmailTemplates1788800000000.KEYS) {
      const template = DEFAULT_EMAIL_TEMPLATES.find((t) => t.key === key);
      if (!template) {
        // Definition removed from the source list. Skip rather than throw:
        // failing here would block every later migration behind it.
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
      [SeedMeetingEmailTemplates1788800000000.KEYS],
    );
  }
}
