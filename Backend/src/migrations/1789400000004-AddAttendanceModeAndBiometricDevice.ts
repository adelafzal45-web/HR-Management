import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the company-wide attendance mode + biometric device connection to
 * company_settings.
 *
 * `attendance_mode` is the org-level switch between 'Manual' (employees clock
 * in/out themselves; any connected device is ignored) and 'Device' (a physical
 * ZKTeco terminal records attendance and self check-in is disabled). A scalar
 * varchar with a DB CHECK mirroring the DTO allow-list, defaulting to 'Manual'
 * so applying this to an existing install changes no behaviour until HR opts in.
 *
 * `biometric_device` is the connection the listener dials, as one nullable jsonb
 * blob (mirroring theme_config); null means "not configured" and the biometric
 * service uses its built-in defaults. Deliberately not on the public branding
 * payload — a device address is internal.
 *
 * Idempotent: the columns use IF NOT EXISTS and the CHECK is dropped-then-added.
 */
export class AddAttendanceModeAndBiometricDevice1789400000004
  implements MigrationInterface
{
  name = 'AddAttendanceModeAndBiometricDevice1789400000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        ADD COLUMN IF NOT EXISTS "attendance_mode" character varying(20) NOT NULL DEFAULT 'Manual',
        ADD COLUMN IF NOT EXISTS "biometric_device" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "company_settings"
        DROP CONSTRAINT IF EXISTS "CHK_company_settings_attendance_mode"
    `);
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        ADD CONSTRAINT "CHK_company_settings_attendance_mode"
        CHECK ("attendance_mode" IN ('Device', 'Manual'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        DROP CONSTRAINT IF EXISTS "CHK_company_settings_attendance_mode"
    `);
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        DROP COLUMN IF EXISTS "biometric_device",
        DROP COLUMN IF EXISTS "attendance_mode"
    `);
  }
}
