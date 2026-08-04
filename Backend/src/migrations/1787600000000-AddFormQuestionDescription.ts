import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives each form↔question link an optional description, plus its snapshot.
 *
 * The description is helper text shown under the question title — "score on
 * consistency, not on one good week" — and it is deliberately per-form rather
 * than per-bank-question. The same bank question can mean subtly different
 * things on a Daily engineering form and a Monthly sales form, and the whole
 * point of the shared bank is that the wording is reused while the framing is
 * not.
 *
 * `snapshot_description` exists for the same reason as `snapshot_text`: a
 * published form must read only its frozen copy. Without the snapshot column
 * the description would be the one field on the card that a later edit could
 * still rewrite underneath an already-answered review — the exact hole the
 * publish snapshot was built to close.
 */
export class AddFormQuestionDescription1787600000000
  implements MigrationInterface
{
  name = 'AddFormQuestionDescription1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
      ADD COLUMN IF NOT EXISTS "description" varchar(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
      ADD COLUMN IF NOT EXISTS "snapshot_description" varchar(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
      DROP COLUMN IF EXISTS "snapshot_description"
    `);

    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
      DROP COLUMN IF EXISTS "description"
    `);
  }
}
