import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatedSchema1785409543305 implements MigrationInterface {
  name = 'UpdatedSchema1785409543305';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appraisal_questions" DROP CONSTRAINT "FK_4e3e383bc97a10585e1b9427d91"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers" DROP CONSTRAINT "FK_2c1227a528d6318753409d95e2b"`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."appraisal_forms_evaluation_type_enum" AS ENUM('Daily', 'Weekly', 'Monthly')`,
    );

    await queryRunner.query(
      `CREATE TABLE "appraisal_forms" (
        "form_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_name" character varying(150) NOT NULL,
        "description" text,
        "evaluation_type" "public"."appraisal_forms_evaluation_type_enum" NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'Draft',
        "department_id" uuid,
        "designation_id" uuid,
        "created_by" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_f13aaa0016b7788e2606ac4c409" UNIQUE ("form_name"),
        CONSTRAINT "PK_31e4181980e4ce3375e85d8d14a" PRIMARY KEY ("form_id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "appraisal_form_questions" (
        "form_question_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "display_order" integer NOT NULL DEFAULT '1',
        "weight_percentage" numeric(5,2) NOT NULL,
        "is_required" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "form_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        CONSTRAINT "PK_5a2191f596407ba4dd592d2a00c" PRIMARY KEY ("form_question_id")
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_questions" DROP COLUMN "created_by"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers" DROP COLUMN "question_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ADD "is_absent_auto_zero" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );

    /*
      Made nullable because existing performance_review_answers
      rows already exist from previous migration
    */
    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ADD "form_question_id" uuid`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."performance_reviews_evaluation_type_enum"
       AS ENUM('Daily', 'Weekly', 'Monthly')`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ADD "evaluation_type"
       "public"."performance_reviews_evaluation_type_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ADD "status" character varying(20) NOT NULL DEFAULT 'Draft'`,
    );

    /*
      Nullable because existing performance reviews
      cannot have these values yet
    */
    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ADD "form_id" uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ADD "attendance_id" uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
      ALTER COLUMN "answered_percentage" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
      ALTER COLUMN "answered_percentage" SET DEFAULT '0'`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
      ALTER COLUMN "total_score_percentage" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
      ALTER COLUMN "total_score_percentage" SET DEFAULT '0'`,
    );

    await queryRunner.query(
      `ALTER TABLE "attendance"
      ALTER COLUMN "check_in" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "appraisal_form_questions"
       ADD CONSTRAINT "FK_e70c5f594209323e2bc17ae0fc9"
       FOREIGN KEY ("form_id")
       REFERENCES "appraisal_forms"("form_id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_form_questions"
       ADD CONSTRAINT "FK_d95d9e011b9852047b8cddfd228"
       FOREIGN KEY ("question_id")
       REFERENCES "appraisal_questions"("question_id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ADD CONSTRAINT "FK_d3a6f7a96d2fc7a84336bdb681c"
       FOREIGN KEY ("form_question_id")
       REFERENCES "appraisal_form_questions"("form_question_id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ADD CONSTRAINT "FK_8ed8e5bf4240eb02e0de967c82f"
       FOREIGN KEY ("form_id")
       REFERENCES "appraisal_forms"("form_id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ADD CONSTRAINT "FK_a3c47b79f0170128abc77421169"
       FOREIGN KEY ("attendance_id")
       REFERENCES "attendance"("attendance_id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // appraisal form relations
    await queryRunner.query(
      `ALTER TABLE "appraisal_forms"
       ADD CONSTRAINT "FK_appraisal_forms_department"
       FOREIGN KEY ("department_id")
       REFERENCES "departments"("department_id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_forms"
       ADD CONSTRAINT "FK_appraisal_forms_designation"
       FOREIGN KEY ("designation_id")
       REFERENCES "designations"("designation_id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_forms"
       ADD CONSTRAINT "FK_appraisal_forms_creator"
       FOREIGN KEY ("created_by")
       REFERENCES "users"("user_id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appraisal_forms"
       DROP CONSTRAINT "FK_appraisal_forms_creator"`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_forms"
       DROP CONSTRAINT "FK_appraisal_forms_designation"`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_forms"
       DROP CONSTRAINT "FK_appraisal_forms_department"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       DROP CONSTRAINT "FK_a3c47b79f0170128abc77421169"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       DROP CONSTRAINT "FK_8ed8e5bf4240eb02e0de967c82f"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       DROP CONSTRAINT "FK_d3a6f7a96d2fc7a84336bdb681c"`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_form_questions"
       DROP CONSTRAINT "FK_d95d9e011b9852047b8cddfd228"`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_form_questions"
       DROP CONSTRAINT "FK_e70c5f594209323e2bc17ae0fc9"`,
    );

    await queryRunner.query(
      `ALTER TABLE "attendance"
       ALTER COLUMN "check_in" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ALTER COLUMN "total_score_percentage" DROP DEFAULT`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       ALTER COLUMN "total_score_percentage" DROP NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ALTER COLUMN "answered_percentage" DROP DEFAULT`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ALTER COLUMN "answered_percentage" DROP NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       DROP COLUMN "attendance_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       DROP COLUMN "form_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       DROP COLUMN "status"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_reviews"
       DROP COLUMN "evaluation_type"`,
    );

    await queryRunner.query(
      `DROP TYPE "public"."performance_reviews_evaluation_type_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       DROP COLUMN "form_question_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       DROP COLUMN "updated_at"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       DROP COLUMN "is_absent_auto_zero"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ADD "question_id" uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_questions"
       ADD "created_by" uuid`,
    );

    await queryRunner.query(`DROP TABLE "appraisal_form_questions"`);

    await queryRunner.query(`DROP TABLE "appraisal_forms"`);

    await queryRunner.query(
      `DROP TYPE "public"."appraisal_forms_evaluation_type_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "performance_review_answers"
       ADD CONSTRAINT "FK_2c1227a528d6318753409d95e2b"
       FOREIGN KEY ("question_id")
       REFERENCES "appraisal_questions"("question_id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "appraisal_questions"
       ADD CONSTRAINT "FK_4e3e383bc97a10585e1b9427d91"
       FOREIGN KEY ("created_by")
       REFERENCES "users"("user_id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
