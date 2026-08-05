import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives each form↔question link its own active flag.
 *
 * Until now, "is this question active on this form" was read from
 * `appraisal_questions.is_active`. That worked while every question belonged to
 * exactly one form. Questions are now a shared, reusable bank, so that column
 * has become the wrong place for the answer: deactivating a bank question in
 * order to drop it from one form would drop it from every other form using it —
 * including published forms whose weights would then no longer total 100%.
 *
 * After this migration the two flags mean different things:
 *   - `appraisal_questions.is_active`      — is this question offered in the bank
 *   - `appraisal_form_questions.is_active` — is it live on this particular form
 */
export class AddFormQuestionActive1787400000000 implements MigrationInterface {
  name = 'AddFormQuestionActive1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);

    // Carry the existing state across. Anything the old form builder had
    // deactivated must stay deactivated, otherwise every previously-removed
    // question silently reappears on its form the moment this deploys.
    await queryRunner.query(`
      UPDATE "appraisal_form_questions" AS afq
      SET "is_active" = false
      FROM "appraisal_questions" AS q
      WHERE q."question_id" = afq."question_id"
        AND q."is_active" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
      DROP COLUMN IF EXISTS "is_active"
    `);
  }
}
