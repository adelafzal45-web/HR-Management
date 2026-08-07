import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaveDurationandDays1788100000000
  implements MigrationInterface
{
  name = 'AddLeaveDurationandDays1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN "duration_type" varchar(20) DEFAULT 'FULL_DAY'
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN "days_count" numeric(5,2) NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP COLUMN "days_count"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP COLUMN "duration_type"
    `);
  }
}
