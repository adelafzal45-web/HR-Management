import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShiftsSchema1784802648362 implements MigrationInterface {
  name = 'ShiftsSchema1784802648362';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create shifts table
    await queryRunner.query(`
      CREATE TABLE "shifts" (
        "shift_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "shift_name" character varying(100) NOT NULL,
        "start_time" TIME NOT NULL,
        "end_time" TIME NOT NULL,
        "grace_period_minutes" integer NOT NULL DEFAULT 0,
        "status" character varying(20) NOT NULL DEFAULT 'Active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_shift_name" UNIQUE ("shift_name"),
        CONSTRAINT "PK_shift_id" PRIMARY KEY ("shift_id")
      )
    `);

    // Users table changes
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "shift_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "overtime_hours" numeric(5,2)
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "is_overtime" boolean NOT NULL DEFAULT false
    `);

    // Attendance table changes
    await queryRunner.query(`
      ALTER TABLE "attendance"
      ADD COLUMN "shift_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      ADD COLUMN "overtime_hours" numeric(5,2)
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      ADD COLUMN "is_overtime" boolean NOT NULL DEFAULT false
    `);

    // Foreign Keys

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_shift"
      FOREIGN KEY ("shift_id")
      REFERENCES "shifts"("shift_id")
      ON DELETE SET NULL
      ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      ADD CONSTRAINT "FK_attendance_shift"
      FOREIGN KEY ("shift_id")
      REFERENCES "shifts"("shift_id")
      ON DELETE SET NULL
      ON UPDATE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance"
      DROP CONSTRAINT "FK_attendance_shift"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "FK_users_shift"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      DROP COLUMN "is_overtime"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      DROP COLUMN "overtime_hours"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      DROP COLUMN "shift_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "is_overtime"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "overtime_hours"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "shift_id"
    `);

    await queryRunner.query(`
      DROP TABLE "shifts"
    `);
  }
}
