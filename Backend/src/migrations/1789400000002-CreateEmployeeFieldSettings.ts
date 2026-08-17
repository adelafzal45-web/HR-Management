import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Single-row table backing Settings → Employee Fields, plus the permission that
 * gates editing it.
 *
 * `field_config` is a jsonb map (fieldKey -> required?) over the configurable
 * employee-field set. The seeded default mirrors the requiredness those fields
 * had before this feature existed (phone / date_of_birth / gender required, the
 * rest optional), so seeding the row changes nothing until an admin edits it.
 * Fixed id = 1 by design — the CHECK permits a single row and the controller
 * enforces GET/PATCH against id = 1.
 *
 * Permission model: reading the config is authentication-only (it drives both
 * the admin employee form and the self-service profile screen), so only
 * `employee-fields.manage` — the edit capability — is seeded. It is granted to
 * every admin and HR alias, because those role names vary by install ('Admin' /
 * 'Administrator' / 'Super Admin', 'HR Admin' / 'HR Manager' / 'HR') and the
 * same set administers the rest of the Settings workspace. The CROSS JOIN grant
 * makes an absent alias a clean no-op.
 *
 * Idempotent: table/columns use IF NOT EXISTS, the seed uses ON CONFLICT DO
 * NOTHING, and grants are guarded with NOT EXISTS (role_permissions has no
 * unique constraint on (role_id, permission_id)).
 */
export class CreateEmployeeFieldSettings1789400000002
  implements MigrationInterface
{
  name = 'CreateEmployeeFieldSettings1789400000002';

  /** Mirrors DEFAULT_EMPLOYEE_FIELD_CONFIG in validation.constants.ts. */
  private static readonly DEFAULT_FIELD_CONFIG = {
    phone: true,
    date_of_birth: true,
    gender: true,
    blood_group: false,
    address: false,
    emergency_contact_name: false,
    emergency_contact_relationship: false,
    emergency_contact_phone: false,
    bank_name: false,
    bank_account_number: false,
    bank_routing_code: false,
  };

  private static readonly PERMISSION: [string, string] = [
    'employee-fields.manage',
    'Configure which employee fields are required',
  ];

  /**
   * Every admin/HR alias that administers the Settings workspace. Absent
   * aliases match zero rows in the CROSS JOIN — a clean no-op.
   */
  private static readonly GRANTED_ROLES = [
    'Admin',
    'Administrator',
    'Super Admin',
    'HR Admin',
    'HR Manager',
    'HR',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Table.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_field_settings" (
        "id" integer NOT NULL DEFAULT 1,
        "field_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_field_settings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_employee_field_settings_id_one" CHECK ("id" = 1)
      )
    `);

    // ------------------------------------------------------------------
    // 2. Seed the single row with the pre-feature defaults.
    // ------------------------------------------------------------------
    await queryRunner.query(
      `INSERT INTO "employee_field_settings" ("id", "field_config")
       VALUES (1, $1::jsonb)
       ON CONFLICT ("id") DO NOTHING`,
      [JSON.stringify(CreateEmployeeFieldSettings1789400000002.DEFAULT_FIELD_CONFIG)],
    );

    // ------------------------------------------------------------------
    // 3. Permission vocabulary + grants.
    // ------------------------------------------------------------------
    const [permName, permDescription] =
      CreateEmployeeFieldSettings1789400000002.PERMISSION;

    await queryRunner.query(
      `INSERT INTO "permissions" ("permission_name", "description")
       VALUES ($1, $2)
       ON CONFLICT ("permission_name") DO NOTHING`,
      [permName, permDescription],
    );

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
       SELECT r."role_id", p."permission_id"
       FROM "roles" r
       CROSS JOIN "permissions" p
       WHERE r."role_name" = ANY($1::varchar[])
         AND p."permission_name" = $2
         AND NOT EXISTS (
           SELECT 1 FROM "role_permissions" rp
           WHERE rp."role_id" = r."role_id"
             AND rp."permission_id" = p."permission_id"
         )`,
      [CreateEmployeeFieldSettings1789400000002.GRANTED_ROLES, permName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [permName] = CreateEmployeeFieldSettings1789400000002.PERMISSION;

    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "permissions" p
       WHERE rp."permission_id" = p."permission_id"
         AND p."permission_name" = $1`,
      [permName],
    );

    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "permission_name" = $1`,
      [permName],
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "employee_field_settings"`);
  }
}
