import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the admin-configurable celebration announcement to company_settings
 * (backlog #2b).
 *
 * One nullable jsonb column rather than a scalar per knob (mirroring
 * `theme_config` / `biometric_device`): the Celebrations settings screen owns a
 * small config object — enabled, send time, heading, and two wish templates — and
 * it is replaced wholesale, so a blob avoids a migration + DTO edit per field.
 * Unlike theme_config it is NOT served on the public branding payload; nothing
 * here is needed before login.
 *
 * Nullable with no default: the seeded row (and any pre-existing install) reads
 * back NULL, which the scheduler treats as "no override" and runs with
 * CELEBRATION_CONFIG_DEFAULTS — i.e. the original hard-coded 08:00 behaviour.
 * Admins opt in by saving on the Celebrations screen. `synchronize` is off, so
 * this column only exists once the migration runs.
 */
export class AddCelebrationConfig1789400000008 implements MigrationInterface {
  name = 'AddCelebrationConfig1789400000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      ADD COLUMN IF NOT EXISTS "celebration_config" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
      DROP COLUMN IF EXISTS "celebration_config"
    `);
  }
}
