import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the admin-configurable design theme to company_settings.
 *
 * One nullable jsonb column rather than a scalar per knob: the Appearance
 * settings screen controls ~40 values (semantic colours × 2 schemes, radii,
 * shadow, typography, layout, mode/density) and is expected to grow, so a blob
 * avoids a migration + DTO edit per future knob. It is served on the public
 * branding payload so the whole app themes itself before login.
 *
 * Nullable with no default: the seeded row (and any pre-existing install) reads
 * back NULL, which the frontend treats as "no override" and renders with its
 * DEFAULT_THEME. Admins opt in by saving on the Appearance screen.
 */
export class AddThemeConfig1789400000003 implements MigrationInterface {
  name = 'AddThemeConfig1789400000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      ADD COLUMN IF NOT EXISTS "theme_config" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      DROP COLUMN IF EXISTS "theme_config"
    `);
  }
}
