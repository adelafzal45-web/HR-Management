import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adds versioning support to appraisal forms so published forms can be edited
 * without breaking historical reviews.
 *
 * - `appraisal_forms.version` tracks the current version (starts at 1)
 * - `appraisal_form_questions.version` lets multiple snapshots coexist per question
 * - `performance_reviews.form_version` locks which version a review used
 *
 * When a published form is edited, the service increments `version` and creates
 * new link rows for the new version's questions. Old link rows stay for old reviews.
 */
export class AddFormVersioning1788000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add version to appraisal_forms
    await queryRunner.addColumn(
      'appraisal_forms',
      new TableColumn({
        name: 'version',
        type: 'int',
        default: 1,
        comment:
          'Current version of this form. Incremented when a published form is edited.',
      }),
    );

    // Add version to appraisal_form_questions
    await queryRunner.addColumn(
      'appraisal_form_questions',
      new TableColumn({
        name: 'version',
        type: 'int',
        default: 1,
        comment:
          'Which form version this question snapshot belongs to. Multiple rows per ' +
          'question can exist with different versions, so historical reviews can ' +
          'resolve their original questions.',
      }),
    );

    // Add form_version to performance_reviews
    await queryRunner.addColumn(
      'performance_reviews',
      new TableColumn({
        name: 'form_version',
        type: 'int',
        isNullable: true,
        comment:
          'Which version of the form this review was submitted against. NULL for ' +
          'reviews created before versioning was added (treated as version 1).',
      }),
    );

    // Backfill: all existing rows are version 1
    await queryRunner.query(`
      UPDATE appraisal_forms SET version = 1;
    `);

    await queryRunner.query(`
      UPDATE appraisal_form_questions SET version = 1;
    `);

    await queryRunner.query(`
      UPDATE performance_reviews SET form_version = 1;
    `);

    // Create index on appraisal_form_questions(form_id, version) for version lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_form_question_version"
      ON "appraisal_form_questions" ("form_id", "version");
    `);

    // Create index on performance_reviews(form_id, form_version) for analytics
    await queryRunner.query(`
      CREATE INDEX "IDX_review_form_version"
      ON "performance_reviews" ("form_id", "form_version");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_review_form_version"`);
    await queryRunner.query(`DROP INDEX "IDX_form_question_version"`);

    await queryRunner.dropColumn('performance_reviews', 'form_version');
    await queryRunner.dropColumn('appraisal_form_questions', 'version');
    await queryRunner.dropColumn('appraisal_forms', 'version');
  }
}
