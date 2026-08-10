import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two unrelated column sets that happen to land together:
 *
 *   1. `notifications` gains an optional attachment. A payroll or policy
 *      announcement usually has a PDF behind it, and the existing `link` /
 *      `reference_id` columns point at other records in this system, not at an
 *      uploaded document.
 *
 *      The original filename is stored separately from the URL because the URL
 *      is a UUID by design (the client's filename never reaches the path, so it
 *      cannot carry `../`). Without `attachment_name` the download would save
 *      as `9f3c1e08-….pdf`.
 *
 *   2. `company_settings` gains the two certificate signatories. Certificates
 *      previously signed off as an anonymous "Authorised Signatory"; they now
 *      carry the CEO's and Co-Founder's names above their uploaded signature
 *      images. All four are nullable: every one is optional, and a certificate
 *      with neither signatory configured must still generate.
 *
 * Idempotent throughout — safe to re-run.
 */
export class NotificationAttachmentAndSignatories1789100000000
  implements MigrationInterface
{
  name = 'NotificationAttachmentAndSignatories1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. notifications: optional uploaded attachment
    // ------------------------------------------------------------------
    // Fan-out writes one row per recipient, so these four repeat across a
    // batch. That is deliberate and matches how title/message already behave:
    // the batch is reassembled by grouping, and a per-batch attachment table
    // would buy nothing but a join.
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD COLUMN IF NOT EXISTS "attachment_url" character varying(500),
        ADD COLUMN IF NOT EXISTS "attachment_name" character varying(255),
        ADD COLUMN IF NOT EXISTS "attachment_mime" character varying(100),
        ADD COLUMN IF NOT EXISTS "attachment_size" integer
    `);

    // ------------------------------------------------------------------
    // 2. company_settings: certificate signatories
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        ADD COLUMN IF NOT EXISTS "ceo_name" character varying(150),
        ADD COLUMN IF NOT EXISTS "ceo_signature_url" character varying(500),
        ADD COLUMN IF NOT EXISTS "cofounder_name" character varying(150),
        ADD COLUMN IF NOT EXISTS "cofounder_signature_url" character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        DROP COLUMN IF EXISTS "ceo_name",
        DROP COLUMN IF EXISTS "ceo_signature_url",
        DROP COLUMN IF EXISTS "cofounder_name",
        DROP COLUMN IF EXISTS "cofounder_signature_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        DROP COLUMN IF EXISTS "attachment_url",
        DROP COLUMN IF EXISTS "attachment_name",
        DROP COLUMN IF EXISTS "attachment_mime",
        DROP COLUMN IF EXISTS "attachment_size"
    `);
  }
}
