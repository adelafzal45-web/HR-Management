import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppraisalAndReviews1784884377301 implements MigrationInterface {
  name = 'AppraisalAndReviews1784884377301';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_attendance_shift"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_shift"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_job_category"`,
    );
    await queryRunner.query(
      `CREATE TABLE "performance_reviews" ("review_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "review_period" character varying(50) NOT NULL, "rating" numeric(3,2) NOT NULL, "comments" text, "review_date" date NOT NULL, "user_id" uuid NOT NULL, "question_id" uuid NOT NULL, CONSTRAINT "PK_93dfe017265895096319404040f" PRIMARY KEY ("review_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "appraisal_questions" ("question_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "question_text" text NOT NULL, "question_type" character varying(30) NOT NULL, "weight" numeric(5,2) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, CONSTRAINT "PK_fd448b8c766259c180268237411" PRIMARY KEY ("question_id"))`,
    );
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN "user_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "overtime_hours"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_overtime"`);
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_fc40f41a0b3686e8c43ed290d70" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" ADD CONSTRAINT "FK_7f24e8687a99cdf941196fa5413" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" ADD CONSTRAINT "FK_d663d4b986586658f6851bc0f9d" FOREIGN KEY ("question_id") REFERENCES "appraisal_questions"("question_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appraisal_questions" ADD CONSTRAINT "FK_869c66563faf1aa7c13ff7a6d02" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_586a7696616297adaf104f78b21" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_1144aa8669db47ec82be24b285e" FOREIGN KEY ("job_category_id") REFERENCES "job_categories"("job_category_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_1144aa8669db47ec82be24b285e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_586a7696616297adaf104f78b21"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appraisal_questions" DROP CONSTRAINT "FK_869c66563faf1aa7c13ff7a6d02"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" DROP CONSTRAINT "FK_d663d4b986586658f6851bc0f9d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" DROP CONSTRAINT "FK_7f24e8687a99cdf941196fa5413"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_fc40f41a0b3686e8c43ed290d70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_overtime" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "overtime_hours" numeric(5,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD "user_id" uuid NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE "appraisal_questions"`);
    await queryRunner.query(`DROP TABLE "performance_reviews"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_job_category" FOREIGN KEY ("job_category_id") REFERENCES "job_categories"("job_category_id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_shift" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_attendance_shift" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
