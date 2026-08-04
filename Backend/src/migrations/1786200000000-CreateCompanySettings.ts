import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Single-row global company settings table.
 *
 * Holds company identity (legal name, registration, industry), operational
 * config (timezone, currency, default working days), and branding (display
 * name, logo URLs for standard + collapsed sidebar, favicon, contact details,
 * primary theme color).
 *
 * Fixed id = 1 by design — no multi-tenancy. The seed below ensures exactly
 * one row exists; the controller enforces GET/PATCH against id=1 only.
 */
export class CreateCompanySettings1786200000000
  implements MigrationInterface
{
  name = 'CreateCompanySettings1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "company_settings" (
        "id" integer NOT NULL DEFAULT 1,
        "legal_company_name" character varying(200) NOT NULL,
        "registration_number" character varying(100),
        "industry" character varying(100),
        "timezone" character varying(50) NOT NULL DEFAULT 'UTC',
        "currency" character varying(10) NOT NULL DEFAULT 'USD',
        "working_days" character varying(50) NOT NULL DEFAULT 'Mon-Fri',
        "company_name" character varying(200) NOT NULL,
        "logo_url" character varying(500),
        "logo_collapsed_url" character varying(500),
        "favicon_url" character varying(500),
        "email" character varying(255),
        "phone" character varying(50),
        "address" text,
        "website" character varying(255),
        "primary_color" character varying(20) DEFAULT '#F1B344',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_settings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_company_settings_id_one" CHECK ("id" = 1)
      )
    `);

    // Seed the single row with placeholder values matching the existing frontend.
    await queryRunner.query(`
      INSERT INTO "company_settings" (
        "id",
        "legal_company_name",
        "registration_number",
        "industry",
        "timezone",
        "currency",
        "working_days",
        "company_name",
        "logo_url",
        "logo_collapsed_url",
        "favicon_url",
        "email",
        "phone",
        "address",
        "website",
        "primary_color"
      ) VALUES (
        1,
        'TechnoCues HR Management',
        '',
        '',
        'UTC',
        'USD',
        'Mon-Fri',
        'TechnoCues',
        '',
        '',
        '',
        'info@technocues.com',
        '',
        '',
        'https://technocues.com',
        '#F1B344'
      )
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "company_settings"`);
  }
}
