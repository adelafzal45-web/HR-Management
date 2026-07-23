import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobCategory1784814080243
  implements MigrationInterface
{
  name = 'AddJobCategory1784814080243';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create Job Categories table
    await queryRunner.query(`
      CREATE TABLE "job_categories" (
        "job_category_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_category_name" character varying(100) NOT NULL,
        "description" text,
        CONSTRAINT "UQ_job_category_name" UNIQUE ("job_category_name"),
        CONSTRAINT "PK_job_category_id" PRIMARY KEY ("job_category_id")
      )
    `);

    // Add job_category_id to users
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "job_category_id" uuid
    `);

    // Add foreign key
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_job_category"
      FOREIGN KEY ("job_category_id")
      REFERENCES "job_categories"("job_category_id")
      ON DELETE SET NULL
      ON UPDATE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "FK_users_job_category"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "job_category_id"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE "job_categories"
    `);
  }
}