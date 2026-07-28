import { MigrationInterface, QueryRunner } from "typeorm";

export class AppraisalAndPerformanceFinal1785235704186 implements MigrationInterface {
    name = 'AppraisalAndPerformanceFinal1785235704186'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "appraisal_question_options" ("option_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "option_text" text NOT NULL, "score" numeric(5,2) NOT NULL, "display_order" integer NOT NULL, "question_id" uuid NOT NULL, CONSTRAINT "PK_35d4f33472290130bb93a6aa61c" PRIMARY KEY ("option_id"))`);
        await queryRunner.query(`CREATE TABLE "appraisal_question_weights" ("weight_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "weight_percentage" numeric(5,2) NOT NULL, "question_id" uuid NOT NULL, CONSTRAINT "REL_559d639b1c8eb1ecc0aa2110e1" UNIQUE ("question_id"), CONSTRAINT "PK_42946c1846406ab1ded7631e6d4" PRIMARY KEY ("weight_id"))`);
        await queryRunner.query(`CREATE TABLE "appraisal_questions" ("question_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "question_text" text NOT NULL, "question_type" character varying(30) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid NOT NULL, CONSTRAINT "PK_fd448b8c766259c180268237411" PRIMARY KEY ("question_id"))`);
        await queryRunner.query(`CREATE TABLE "performance_review_answers" ("answer_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "answer_comment" text, "answered_percentage" numeric(5,2), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "review_id" uuid NOT NULL, "question_id" uuid NOT NULL, "selected_option_id" uuid, CONSTRAINT "PK_c0a9f5aeff2e0291591fe0f766a" PRIMARY KEY ("answer_id"))`);
        await queryRunner.query(`CREATE TABLE "performance_reviews" ("review_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "review_period" character varying(50) NOT NULL, "review_date" date NOT NULL, "total_score_percentage" numeric(5,2), "comments" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "reviewer_id" uuid NOT NULL, "reviewee_id" uuid NOT NULL, CONSTRAINT "PK_93dfe017265895096319404040f" PRIMARY KEY ("review_id"))`);
        await queryRunner.query(`ALTER TABLE "appraisal_question_options" ADD CONSTRAINT "FK_0dc14c5cc3aa0b97711503f0406" FOREIGN KEY ("question_id") REFERENCES "appraisal_questions"("question_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appraisal_question_weights" ADD CONSTRAINT "FK_559d639b1c8eb1ecc0aa2110e1c" FOREIGN KEY ("question_id") REFERENCES "appraisal_questions"("question_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appraisal_questions" ADD CONSTRAINT "FK_4e3e383bc97a10585e1b9427d91" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "performance_review_answers" ADD CONSTRAINT "FK_eb3ef48cd9cfa92e4cceaaa16ef" FOREIGN KEY ("review_id") REFERENCES "performance_reviews"("review_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "performance_review_answers" ADD CONSTRAINT "FK_2c1227a528d6318753409d95e2b" FOREIGN KEY ("question_id") REFERENCES "appraisal_questions"("question_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "performance_review_answers" ADD CONSTRAINT "FK_2af9200b745e00854d504259c0a" FOREIGN KEY ("selected_option_id") REFERENCES "appraisal_question_options"("option_id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "performance_reviews" ADD CONSTRAINT "FK_2d11995817c8d382fb313dc46cf" FOREIGN KEY ("reviewer_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "performance_reviews" ADD CONSTRAINT "FK_6bad6cf6cb2828b0ec1b397539c" FOREIGN KEY ("reviewee_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "performance_reviews" DROP CONSTRAINT "FK_6bad6cf6cb2828b0ec1b397539c"`);
        await queryRunner.query(`ALTER TABLE "performance_reviews" DROP CONSTRAINT "FK_2d11995817c8d382fb313dc46cf"`);
        await queryRunner.query(`ALTER TABLE "performance_review_answers" DROP CONSTRAINT "FK_2af9200b745e00854d504259c0a"`);
        await queryRunner.query(`ALTER TABLE "performance_review_answers" DROP CONSTRAINT "FK_2c1227a528d6318753409d95e2b"`);
        await queryRunner.query(`ALTER TABLE "performance_review_answers" DROP CONSTRAINT "FK_eb3ef48cd9cfa92e4cceaaa16ef"`);
        await queryRunner.query(`ALTER TABLE "appraisal_questions" DROP CONSTRAINT "FK_4e3e383bc97a10585e1b9427d91"`);
        await queryRunner.query(`ALTER TABLE "appraisal_question_weights" DROP CONSTRAINT "FK_559d639b1c8eb1ecc0aa2110e1c"`);
        await queryRunner.query(`ALTER TABLE "appraisal_question_options" DROP CONSTRAINT "FK_0dc14c5cc3aa0b97711503f0406"`);
        await queryRunner.query(`DROP TABLE "performance_reviews"`);
        await queryRunner.query(`DROP TABLE "performance_review_answers"`);
        await queryRunner.query(`DROP TABLE "appraisal_questions"`);
        await queryRunner.query(`DROP TABLE "appraisal_question_weights"`);
        await queryRunner.query(`DROP TABLE "appraisal_question_options"`);
    }

}
