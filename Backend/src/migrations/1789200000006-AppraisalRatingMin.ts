import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a rating question's scale start at 0 instead of always at 1.
 *
 * `appraisal_form_questions.rating_scale` has always been the *upper* bound —
 * reviewers picked a whole number up to it, with the lower bound implicitly
 * fixed at 1 (the form builder's slider hardcoded `min={1}`). HR asked for
 * 0–5 / 0–10 presets alongside the existing 1–5 / 1–10 ones, which means the
 * lower bound now has to be stored too, not assumed.
 *
 * `rating_min` is 0 or 1 only — nothing asked for an arbitrary floor, and a
 * two-value CHECK keeps that from drifting. Existing rows default to 1, which
 * is exactly the behaviour they already had, so no backfill changes what any
 * previously-published form does.
 *
 * The percentage normalisation in `appraisal-facade.service.ts` (score / scale)
 * is unaffected either way: it was already linear from 0, so a 0-based scale
 * needs no formula change, only a wider accepted range and an honest lower
 * bound to validate against.
 *
 * Idempotent: safe to re-run.
 */
export class AppraisalRatingMin1789200000006 implements MigrationInterface {
  name = 'AppraisalRatingMin1789200000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        ADD COLUMN IF NOT EXISTS "rating_min" integer NOT NULL DEFAULT 1;
    `);

    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP CONSTRAINT IF EXISTS "CHK_afq_rating_min";
    `);
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        ADD CONSTRAINT "CHK_afq_rating_min"
        CHECK ("rating_min" IN (0, 1));
    `);

    // The scale must still leave at least a 2-point spread above the floor
    // (e.g. min 1 needs scale >= 3 to be a meaningful rating, min 0 needs
    // scale >= 2, which CHK_afq_rating_scale already guarantees). This keeps
    // a 1-based scale from being saved as `rating_scale = 1`, which would
    // leave reviewers exactly one option to pick.
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP CONSTRAINT IF EXISTS "CHK_afq_rating_min_lt_scale";
    `);
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        ADD CONSTRAINT "CHK_afq_rating_min_lt_scale"
        CHECK ("rating_min" < "rating_scale");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP CONSTRAINT IF EXISTS "CHK_afq_rating_min_lt_scale";
    `);
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP CONSTRAINT IF EXISTS "CHK_afq_rating_min";
    `);
    await queryRunner.query(`
      ALTER TABLE "appraisal_form_questions"
        DROP COLUMN IF EXISTS "rating_min";
    `);
  }
}
