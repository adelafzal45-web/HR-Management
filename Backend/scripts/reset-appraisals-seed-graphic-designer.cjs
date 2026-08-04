/*
 * One-off maintenance script.
 *
 *   node scripts/reset-appraisals-seed-graphic-designer.cjs          (dry run)
 *   node scripts/reset-appraisals-seed-graphic-designer.cjs --commit (apply)
 *
 * What it does, in a single transaction:
 *   1. Deletes every appraisal form and every evaluation recorded against one.
 *      The reusable question bank (appraisal_questions + appraisal_question_options)
 *      and the team-lead rosters are deliberately left untouched.
 *   2. Creates a "Graphic Designer" designation under the 3d Designers department.
 *   3. Creates and publishes three Daily evaluation forms aimed at that designation.
 *
 * The API cannot do step 1: `deleteForm` archives rather than deletes as soon as a
 * form has reviews against it, and thirteen of them do. Hence direct SQL.
 *
 * Step 3 replicates `publishForm`'s snapshot semantics exactly — snapshot_text,
 * snapshot_type, snapshot_description and snapshot_options are frozen at publish so
 * a later edit to a bank question cannot rewrite a published form's history.
 */
const { randomUUID } = require('crypto');
const { Client } = require('pg');

const COMMIT = process.argv.includes('--commit');

const DEPARTMENT_3D = 'f418c1c5-3068-4e28-ace3-91812e1643b1';
const CREATED_BY = '5269a7da-0db6-49b8-97eb-c2d482cb611a'; // Haseeb Iqbal (Admin)

/*
 * Deletion order follows the foreign keys inward: everything that points at a
 * review goes before the review, and everything that points at a form goes
 * before the form. `appraisal_notifications.related_review_id` is the easy one
 * to miss — it is nullable, so the constraint bites only at delete time.
 */
const DELETE_ORDER = [
  'performance_review_answers',
  'review_approvals',
  'appraisal_notifications',
  'performance_reviews',
  'appraisal_form_questions',
  'appraisal_form_assignments',
  'appraisal_forms',
];

const PRESERVE = [
  'appraisal_questions',
  'appraisal_question_options',
  'team_lead_assignments',
  'team_lead_assignment_members',
];

/*
 * Bank questions this seed needs that the bank does not already have. Matched by
 * text, so a re-run reuses the row it created the first time instead of tripping
 * over a duplicate. Rating questions carry no options on purpose: the scale on
 * the form link drives them, which is how the form editor models rating types.
 */
const NEW_BANK_QUESTIONS = [
  { text: 'Design Quality and Visual Consistency', type: 'rating' },
  { text: 'Turnaround Time and Deadline Adherence', type: 'rating' },
  { text: 'Brief Comprehension and Revision Handling', type: 'rating' },
  { text: 'Creativity and Originality', type: 'rating' },
  { text: 'File Organisation and Asset Handoff', type: 'rating' },
  { text: 'Feedback Receptiveness', type: 'rating' },
  {
    text: 'Brand Guideline Compliance',
    type: 'yes_no',
    // Scores are percentages, matching `performance_review_answers.answered_percentage`
    // and the seeded rating questions (25/50/75/100) rather than the 0/1 and 0/10
    // scales left behind by earlier probe data.
    options: [
      { text: 'Yes', score: 100 },
      { text: 'No', score: 0 },
    ],
  },
  {
    text: 'Daily Task Completion Rate',
    type: 'dropdown',
    options: [
      { text: 'Below 50% of assigned tasks', score: 0 },
      { text: '50-74% of assigned tasks', score: 50 },
      { text: '75-89% of assigned tasks', score: 75 },
      { text: '90-100% of assigned tasks', score: 100 },
    ],
  },
];

const EXTRA_COMMENTS = "Any additional comments on this employee's performance?";

/*
 * Weights on the scored questions total exactly 100 in each form — the same gate
 * `publishForm` enforces server-side. text_feedback carries no weight, which is
 * also a server rule, not a stylistic choice.
 */
const FORMS = [
  {
    name: 'Graphic Designer - Daily Quality Check',
    description:
      'Daily review of a graphic designer’s output quality, delivery speed and adherence to the brief.',
    questions: [
      {
        text: 'Design Quality and Visual Consistency',
        weight: 30,
        scale: 5,
        description: 'Typography, spacing, colour use and consistency with previous work.',
      },
      {
        text: 'Turnaround Time and Deadline Adherence',
        weight: 25,
        scale: 5,
        description: 'Were today’s assigned designs delivered within the agreed time?',
      },
      {
        text: 'Brief Comprehension and Revision Handling',
        weight: 25,
        scale: 5,
        description: 'How accurately the brief was interpreted and how cleanly revisions were absorbed.',
      },
      { text: 'Punctuality', weight: 20, scale: 5 },
      { text: EXTRA_COMMENTS, weight: 0, required: false },
    ],
  },
  {
    name: 'Graphic Designer - Daily Creative Output',
    description:
      'Daily review of creative originality, brand compliance and how cleanly assets are handed off.',
    questions: [
      {
        text: 'Creativity and Originality',
        weight: 35,
        scale: 10,
        description: 'Rated out of 10. Freshness of concept and willingness to explore alternatives.',
      },
      {
        text: 'Brand Guideline Compliance',
        weight: 25,
        description: 'Did every asset produced today follow the brand guidelines?',
      },
      {
        text: 'File Organisation and Asset Handoff',
        weight: 20,
        scale: 5,
        description: 'Naming, layer structure, export formats and whether the handoff needed chasing.',
      },
      { text: 'Communication', weight: 20, scale: 5 },
      { text: EXTRA_COMMENTS, weight: 0, required: false },
    ],
  },
  {
    name: 'Graphic Designer - Daily Collaboration and Discipline',
    description:
      'Daily review of teamwork, responsiveness to feedback and completion of the assigned workload.',
    questions: [
      { text: 'Teamwork', weight: 30, scale: 5 },
      {
        text: 'Feedback Receptiveness',
        weight: 25,
        scale: 5,
        description: 'How constructively critique was taken and acted upon.',
      },
      {
        text: 'Daily Task Completion Rate',
        weight: 25,
        description: 'Share of the tasks assigned at the start of the day that were completed.',
      },
      { text: 'Job Knowledge', weight: 20, scale: 5 },
      { text: EXTRA_COMMENTS, weight: 0, required: false },
    ],
  },
];

async function counts(client, tables) {
  const out = {};
  for (const table of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    out[table] = rows[0].n;
  }
  return out;
}

(async () => {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'HR',
  });
  await client.connect();

  const watched = [...DELETE_ORDER, ...PRESERVE, 'designations'];
  const before = await counts(client, watched);

  await client.query('BEGIN');
  try {
    // ---- 1. delete -------------------------------------------------------
    const deleted = {};
    for (const table of DELETE_ORDER) {
      const res = await client.query(`DELETE FROM ${table}`);
      deleted[table] = res.rowCount;
    }

    // ---- 2. designation --------------------------------------------------
    // `designations.title` carries a UNIQUE constraint, so reuse before insert.
    let designationId;
    const existing = await client.query(
      `SELECT designation_id FROM designations WHERE title = $1`,
      ['Graphic Designer'],
    );
    if (existing.rows.length) {
      designationId = existing.rows[0].designation_id;
    } else {
      designationId = randomUUID();
      await client.query(
        `INSERT INTO designations (designation_id, title, department_id) VALUES ($1, $2, $3)`,
        [designationId, 'Graphic Designer', DEPARTMENT_3D],
      );
    }

    // ---- 3. bank questions this seed needs -------------------------------
    for (const q of NEW_BANK_QUESTIONS) {
      const found = await client.query(
        `SELECT question_id FROM appraisal_questions WHERE question_text = $1`,
        [q.text],
      );
      if (found.rows.length) {
        q.questionId = found.rows[0].question_id;
        continue;
      }
      q.questionId = randomUUID();
      await client.query(
        `INSERT INTO appraisal_questions (question_id, question_text, question_type, is_active)
         VALUES ($1, $2, $3, true)`,
        [q.questionId, q.text, q.type],
      );
      let order = 1;
      for (const opt of q.options ?? []) {
        await client.query(
          `INSERT INTO appraisal_question_options (option_id, option_text, score, display_order, question_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), opt.text, opt.score, order++, q.questionId],
        );
      }
    }

    // Resolve every question this seed references — new and pre-existing alike.
    const bank = new Map();
    for (const row of (
      await client.query(`SELECT question_id, question_text, question_type FROM appraisal_questions`)
    ).rows) {
      bank.set(row.question_text, { id: row.question_id, type: row.question_type });
    }
    for (const form of FORMS) {
      for (const q of form.questions) {
        if (!bank.has(q.text)) {
          throw new Error(`Question bank has no entry for "${q.text}"`);
        }
      }
    }

    const optionsByQuestion = new Map();
    for (const row of (
      await client.query(
        `SELECT option_id, option_text, score, display_order, question_id
         FROM appraisal_question_options ORDER BY question_id, display_order`,
      )
    ).rows) {
      if (!optionsByQuestion.has(row.question_id)) optionsByQuestion.set(row.question_id, []);
      optionsByQuestion.get(row.question_id).push(row);
    }

    // ---- 4. forms, questions, snapshots, audience ------------------------
    const created = [];
    for (const form of FORMS) {
      const total = form.questions.reduce((sum, q) => sum + q.weight, 0);
      if (total !== 100) {
        throw new Error(`"${form.name}" weights total ${total}%, not 100%`);
      }

      const formId = randomUUID();
      await client.query(
        `INSERT INTO appraisal_forms
           (form_id, form_name, description, evaluation_type, status,
            department_id, designation_id, created_by, is_active)
         VALUES ($1, $2, $3, 'Daily', 'Published', $4, $5, $6, true)`,
        [formId, form.name, form.description, DEPARTMENT_3D, designationId, CREATED_BY],
      );

      let order = 1;
      for (const q of form.questions) {
        const entry = bank.get(q.text);
        const opts = (optionsByQuestion.get(entry.id) ?? []).map((o) => ({
          optionId: o.option_id,
          optionText: o.option_text,
          score: Number(o.score),
          displayOrder: o.display_order,
        }));
        await client.query(
          `INSERT INTO appraisal_form_questions
             (form_question_id, form_id, question_id, display_order, weight_percentage,
              is_required, rating_scale, description,
              snapshot_text, snapshot_type, snapshot_description, snapshot_options, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, true)`,
          [
            randomUUID(),
            formId,
            entry.id,
            order++,
            q.weight,
            q.required !== false,
            // Inert for non-rating types, but the column is NOT NULL with a
            // CHECK of 2..100, so it still needs a legal value.
            q.scale ?? 5,
            q.description ?? null,
            q.text,
            entry.type,
            q.description ?? null,
            JSON.stringify(opts),
          ],
        );
      }

      await client.query(
        `INSERT INTO appraisal_form_assignments (assignment_id, form_id, designation_id, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [randomUUID(), formId, designationId],
      );

      created.push({ formId, name: form.name });
    }

    // ---- report ----------------------------------------------------------
    console.log('=== deleted ===');
    for (const table of DELETE_ORDER) {
      console.log(`${String(deleted[table]).padStart(6)}  ${table}`);
    }

    const after = await counts(client, watched);
    console.log('\n=== preserved (before -> after) ===');
    for (const table of PRESERVE) {
      console.log(`  ${table.padEnd(30)} ${before[table]} -> ${after[table]}`);
    }
    console.log(`  ${'designations'.padEnd(30)} ${before.designations} -> ${after.designations}`);

    console.log('\n=== created ===');
    console.log(`  designation  Graphic Designer  [${designationId}]  under 3d Designers`);
    for (const c of created) {
      console.log(`  form         ${c.name}  [${c.formId}]`);
    }

    const check = await client.query(
      `SELECT f.form_name, f.evaluation_type, f.status, f.is_active,
              COUNT(fq.form_question_id)::int AS questions,
              SUM(fq.weight_percentage)::int  AS weight,
              COUNT(fq.snapshot_text)::int    AS snapshotted,
              (SELECT COUNT(*)::int FROM appraisal_form_assignments a WHERE a.form_id = f.form_id) AS assignments
       FROM appraisal_forms f
       LEFT JOIN appraisal_form_questions fq ON fq.form_id = f.form_id
       GROUP BY f.form_id, f.form_name, f.evaluation_type, f.status, f.is_active
       ORDER BY f.form_name`,
    );
    console.log('\n=== verification ===');
    console.table(check.rows);

    if (COMMIT) {
      await client.query('COMMIT');
      console.log('\nCOMMITTED.');
    } else {
      await client.query('ROLLBACK');
      console.log('\nDRY RUN - rolled back. Re-run with --commit to apply.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
