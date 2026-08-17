import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the biometric_users table used to map the employee's
 * ZKTeco device user ID to the corresponding HR portal user.
 *
 * The ZKTeco machine assigns the `device_user_id` when an employee
 * is registered on the machine. HR then enters that ID into the
 * HR portal and associates it with an existing User.
 *
 * Relationship:
 *
 *   users
 *      1
 *      |
 *      | user_id
 *      |
 *      1
 *   biometric_users
 *
 * One HR user can have only one biometric machine ID.
 * The device_user_id is also unique because the same machine ID
 * cannot belong to multiple employees.
 */
export class CreateBiometricUsers1787900000000
  implements MigrationInterface
{
  name = 'CreateBiometricUsers1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure PostgreSQL has the extension required for UUID generation.
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    `);

    await queryRunner.query(`
      CREATE TABLE "biometric_users" (
        "biometric_user_id" uuid NOT NULL DEFAULT uuid_generate_v4(),

        "device_user_id" character varying(50) NOT NULL,

        "user_id" uuid NOT NULL,

        "active" boolean NOT NULL DEFAULT true,

        "created_at" TIMESTAMP NOT NULL DEFAULT now(),

        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),

        CONSTRAINT "PK_biometric_users"
          PRIMARY KEY ("biometric_user_id"),

        CONSTRAINT "UQ_biometric_users_device_user_id"
          UNIQUE ("device_user_id"),

        CONSTRAINT "UQ_biometric_users_user_id"
          UNIQUE ("user_id"),

        CONSTRAINT "FK_biometric_users_user"
          FOREIGN KEY ("user_id")
          REFERENCES "users"("user_id")
          ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "biometric_users"
    `);
  }
}