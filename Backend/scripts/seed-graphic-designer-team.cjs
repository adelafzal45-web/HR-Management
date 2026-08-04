/*
 * Seeds a self-contained Graphic Designer demo: logins, a team, the question
 * bank entries, and a published form that ties them together.
 *
 *   node scripts/seed-graphic-designer-team.cjs           (dry run)
 *   node scripts/seed-graphic-designer-team.cjs --commit  (apply)
 *
 * What it creates, in a single transaction:
 *   1. Seven logins, all on the same password — one Admin, one Team Lead, five
 *      Graphic Designers in the 3d Designers department.
 *   2. Ten graphic-designer questions in the reusable bank.
 *   3. A MEMBERS roster putting those five designers under the lead.
 *   4. One published Daily form built from all ten questions, aimed at the
 *      Graphic Designer designation.
 *
 * Unlike reset-appraisals-seed-graphic-designer.cjs this script deletes nothing.
 * It is additive and idempotent: users match on email, questions on text, the
 * form on name, and the roster is rebuilt in place. Re-running changes nothing.
 *
 * The roster is the point of step 3. `resolveVisibleEmployeeIds` reads
 * team_lead_assignments / team_lead_assignment_members — NOT the users.team_lead_id
 * column, which the appraisal module ignores entirely. A lead with no row in those
 * tables resolves to an empty set and can evaluate nobody, which looks like a
 * broken page rather than a missing roster.
 */
const { randomUUID } = require('crypto');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const COMMIT = process.argv.includes('--commit');

const DEPARTMENT = '3d Designers';
const DESIGNATION = 'Graphic Designer';
const LEAD_DESIGNATION = 'lead 3d designer';
const FORM_NAME = 'Graphic Designer - Daily Performance Review';

/*
 * One password for every seeded account, matching SeedTestAccounts1785800000000's
 * convention. AuthService.validateUser bcrypt-compares whenever the stored value
 * starts with "$2", so the hash format is what matters, not the cost.
 */
const PASSWORD = 'Password@123';

/** [email, first, last, employee_code, role_name, designation|null] */
const USERS = [
  ['gd.admin@hrms.local', 'Ammar', 'Admin', 'GD-ADM-001', 'Admin', null],
  ['gd.lead@hrms.local', 'Sana', 'Lead', 'GD-TL-001', 'Team Lead', LEAD_DESIGNATION],
  ['gd.designer1@hrms.local', 'Ayesha', 'Nadeem', 'GD-EMP-001', 'Employee', DESIGNATION],
  ['gd.designer2@hrms.local', 'Bilal', 'Saeed', 'GD-EMP-002', 'Employee', DESIGNATION],
  ['gd.designer3@hrms.local', 'Fatima', 'Zahra', 'GD-EMP-003', 'Employee', DESIGNATION],
  ['gd.designer4@hrms.local', 'Hassan', 'Raza', 'GD-EMP-004', 'Employee', DESIGNATION],
  ['gd.designer5@hrms.local', 'Iqra', 'Javed', 'GD-EMP-005', 'Employee', DESIGNATION],
];

const ADMIN_EMAIL = USERS[0][0];
const LEAD_EMAIL = USERS[1][0];
const MEMBER_EMAILS = USERS.slice(2).map(([email]) => email);

/*
 * The ten questions, in the order they appear on the form.
 *
 * `weight` is a percentage and the ten must total exactly 100 — the same gate
 * publishForm enforces server-side, asserted below before anything is written.
 * Option `score` is also a percentage, matching
 * performance_review_answers.answered_percentage; rating questions carry no
 * options because the scale on the form link drives them.
 */
const QUESTIONS = [
  {
    text: 'Design Quality and Visual Consistency',
    type: 'rating',
    scale: 5,
    weight: 15,
    description: 'Typography, spacing, colour use and consistency with previous work.',
  },
  {
    text: 'Creativity and Originality',
    type: 'rating',
    scale: 10,
    weight: 12,
    description: 'Rated out of 10. Freshness of concept and willingness to explore alternatives.',
  },
  {
    text: 'Typography and Layout Craft',
    type: 'rating',
    scale: 5,
    weight: 10,
    description: 'Type hierarchy, kerning, grid discipline and whitespace control.',
  },
  {
    text: 'Colour and Composition Discipline',
    type: 'rating',
    scale: 5,
    weight: 10,
    description: 'Palette coherence, contrast, accessibility and visual balance.',
  },
  {
    text: 'Brief Comprehension and Revision Handling',
    type: 'rating',
    scale: 5,
    weight: 12,
    description: 'How accurately the brief was interpreted and how cleanly revisions were absorbed.',
  },
  {
    text: 'Turnaround Time and Deadline Adherence',
    type: 'rating',
    scale: 5,
    weight: 12,
    description: 'Were the assigned designs delivered within the agreed time?',
  },
  {
    text: 'File Organisation and Asset Handoff',
    type: 'rating',
    scale: 5,
    weight: 8,
    description: 'Naming, layer structure, export formats and whether the handoff needed chasing.',
  },
  {
    text: 'Brand Guideline Compliance',
    type: 'yes_no',
    weight: 8,
    description: 'Did every asset produced follow the brand guidelines?',
    options: [
      { text: 'Yes', score: 100 },
      { text: 'No', score: 0 },
    ],
  },
  {
    text: 'Design Tool Proficiency',
    type: 'dropdown',
    weight: 8,
    description: 'Command of the tools the role needs day to day (Illustrator, Photoshop, Figma).',
    options: [
      { text: 'Needs structured training', score: 0 },
      { text: 'Works with regular support', score: 50 },
      { text: 'Fully independent', score: 75 },
      { text: 'Mentors others on tooling', score: 100 },
    ],
  },
  {
    text: 'Revision Rounds Before Approval',
    type: 'dropdown',
    weight: 5,
    description: 'How many rounds the work typically took before the stakeholder signed off.',
    options: [
      { text: '4 or more rounds', score: 0 },
      { text: '3 rounds', score: 50 },
      { text: '2 rounds', score: 75 },
      { text: 'Approved first time', score: 100 },
    ],
  },
];

async function scalar(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return rows.length ? Object.values(rows[0])[0] : null;
}

(async () => {
  const weightTotal = QUESTIONS.reduce((sum, q) => sum + q.weight, 0);
  if (weightTotal !== 100) {
    throw new Error(`Question weights total ${weightTotal}%, not 100%`);
  }

  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'HR',
  });
  await client.connect();

  await client.query('BEGIN');
  try {
    const report = { users: [], questions: [], roster: null, form: null };

    // ---- 1. department + designations ------------------------------------
    const departmentId = await scalar(
      client,
      `SELECT department_id FROM departments WHERE department_name = $1`,
      [DEPARTMENT],
    );
    if (!departmentId) {
      throw new Error(`Department "${DEPARTMENT}" not found — nothing to attach the team to.`);
    }

    // designations.title is UNIQUE, so reuse before insert.
    const designationIds = {};
    for (const title of [DESIGNATION, LEAD_DESIGNATION]) {
      let id = await scalar(
        client,
        `SELECT designation_id FROM designations WHERE title = $1`,
        [title],
      );
      if (!id) {
        id = randomUUID();
        await client.query(
          `INSERT INTO designations (designation_id, title, department_id) VALUES ($1, $2, $3)`,
          [id, title, departmentId],
        );
      }
      designationIds[title] = id;
    }

    // ---- 2. logins -------------------------------------------------------
    const hash = bcrypt.hashSync(PASSWORD, 10);
    const userIds = {};

    for (const [email, first, last, code, roleName, designation] of USERS) {
      const roleId = await scalar(
        client,
        `SELECT role_id FROM roles WHERE role_name = $1`,
        [roleName],
      );
      if (!roleId) throw new Error(`Role "${roleName}" not found`);

      // The Admin is left with no department on purpose: their reach comes from
      // appraisal.viewAll, not from department co-membership, and pinning them to
      // one department would misrepresent that in every employee filter.
      const deptForUser = designation ? departmentId : null;
      const desigForUser = designation ? designationIds[designation] : null;

      const existing = await scalar(
        client,
        `SELECT user_id FROM users WHERE email = $1`,
        [email],
      );

      if (existing) {
        // Reset the parts this seed is responsible for. The password is included
        // so a rerun restores a known credential rather than leaving a stale one
        // that no longer matches what this script advertises.
        await client.query(
          `UPDATE users
              SET password = $2, role_id = $3, department_id = $4,
                  designation_id = $5, status = true, updated_at = now()
            WHERE user_id = $1`,
          [existing, hash, roleId, deptForUser, desigForUser],
        );
        userIds[email] = existing;
        report.users.push({ email, role: roleName, action: 'updated' });
      } else {
        const id = randomUUID();
        await client.query(
          `INSERT INTO users (
             user_id, employee_code, first_name, last_name, email, password,
             employee_type, joining_date, status,
             role_id, department_id, designation_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'Full-Time', CURRENT_DATE, true, $7, $8, $9)`,
          [id, code, first, last, email, hash, roleId, deptForUser, desigForUser],
        );
        userIds[email] = id;
        report.users.push({ email, role: roleName, action: 'created' });
      }
    }

    const adminId = userIds[ADMIN_EMAIL];
    const leadId = userIds[LEAD_EMAIL];

    // ---- 3. question bank ------------------------------------------------
    // Matched on text so a rerun reuses the row it made the first time. Six of
    // these already exist from the earlier appraisal seed; those are adopted
    // rather than duplicated, which also keeps their usage counts intact.
    for (const q of QUESTIONS) {
      const found = await client.query(
        `SELECT question_id, question_type FROM appraisal_questions WHERE question_text = $1`,
        [q.text],
      );
      if (found.rows.length) {
        q.questionId = found.rows[0].question_id;
        if (found.rows[0].question_type !== q.type) {
          throw new Error(
            `Bank question "${q.text}" is ${found.rows[0].question_type}, this seed expects ${q.type}. ` +
              `Rename one of them rather than letting the form and the bank disagree.`,
          );
        }
        report.questions.push({ text: q.text, type: q.type, action: 'reused' });
      } else {
        q.questionId = randomUUID();
        await client.query(
          `INSERT INTO appraisal_questions (question_id, question_text, question_type, is_active)
           VALUES ($1, $2, $3, true)`,
          [q.questionId, q.text, q.type],
        );
        report.questions.push({ text: q.text, type: q.type, action: 'created' });
      }

      // Options are rewritten every run so a hand-edited score cannot drift from
      // what this file documents. Rating questions have none by design.
      if (q.options) {
        await client.query(
          `DELETE FROM appraisal_question_options WHERE question_id = $1`,
          [q.questionId],
        );
        let order = 1;
        for (const opt of q.options) {
          await client.query(
            `INSERT INTO appraisal_question_options
               (option_id, option_text, score, display_order, question_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), opt.text, opt.score, order++, q.questionId],
          );
        }
      }
    }

    // ---- 4. roster -------------------------------------------------------
    // MEMBERS mode, not DEPARTMENT: the five designers are named explicitly, so
    // a sixth person joining 3d Designers later does not silently land on this
    // lead's roster. UQ_tla_lead_department_mode is partial on DEPARTMENT rows
    // only, so MEMBERS rows would happily duplicate — hence the reuse-then-clear.
    let assignmentId = await scalar(
      client,
      `SELECT assignment_id FROM team_lead_assignments
        WHERE team_lead_id = $1 AND mode = 'MEMBERS' LIMIT 1`,
      [leadId],
    );
    if (assignmentId) {
      await client.query(
        `DELETE FROM team_lead_assignment_members WHERE assignment_id = $1`,
        [assignmentId],
      );
    } else {
      assignmentId = randomUUID();
      await client.query(
        `INSERT INTO team_lead_assignments
           (assignment_id, team_lead_id, mode, department_id, created_by)
         VALUES ($1, $2, 'MEMBERS', NULL, $3)`,
        [assignmentId, leadId, adminId],
      );
    }
    for (const email of MEMBER_EMAILS) {
      await client.query(
        `INSERT INTO team_lead_assignment_members (assignment_id, user_id)
         VALUES ($1, $2)`,
        [assignmentId, userIds[email]],
      );
    }
    report.roster = { assignmentId, lead: LEAD_EMAIL, members: MEMBER_EMAILS.length };

    // ---- 5. published form ----------------------------------------------
    const existingForm = await scalar(
      client,
      `SELECT form_id FROM appraisal_forms WHERE form_name = $1`,
      [FORM_NAME],
    );

    if (existingForm) {
      // Left exactly as-is. Rebuilding would mean deleting its questions, and any
      // review already recorded against them goes with it.
      report.form = { formId: existingForm, action: 'reused (left untouched)' };
    } else {
      const formId = randomUUID();
      await client.query(
        `INSERT INTO appraisal_forms
           (form_id, form_name, description, evaluation_type, status,
            department_id, designation_id, created_by, is_active)
         VALUES ($1, $2, $3, 'Daily', 'Published', $4, $5, $6, true)`,
        [
          formId,
          FORM_NAME,
          'Daily review of a graphic designer’s craft, delivery and brand compliance.',
          departmentId,
          designationIds[DESIGNATION],
          adminId,
        ],
      );

      // Snapshot columns are frozen here exactly as publishForm would freeze
      // them, so a later edit to a bank question cannot rewrite this published
      // form's history through the back door.
      let order = 1;
      for (const q of QUESTIONS) {
        const opts = (
          await client.query(
            `SELECT option_id, option_text, score, display_order
               FROM appraisal_question_options
              WHERE question_id = $1 ORDER BY display_order`,
            [q.questionId],
          )
        ).rows.map((o) => ({
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
           VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11::jsonb, true)`,
          [
            randomUUID(),
            formId,
            q.questionId,
            order++,
            q.weight,
            // Inert for non-rating types, but the column is NOT NULL with a
            // CHECK of 2..100, so it still needs a legal value.
            q.scale ?? 5,
            q.description ?? null,
            q.text,
            q.type,
            q.description ?? null,
            JSON.stringify(opts),
          ],
        );
      }

      await client.query(
        `INSERT INTO appraisal_form_assignments
           (assignment_id, form_id, designation_id, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [randomUUID(), formId, designationIds[DESIGNATION]],
      );

      report.form = { formId, action: 'created and published' };
    }

    // ---- report ----------------------------------------------------------
    console.log('=== logins ===  (password for all: ' + PASSWORD + ')');
    console.table(report.users);

    console.log('=== question bank ===');
    console.table(report.questions);

    console.log('=== roster ===');
    console.log(
      `  ${report.roster.lead} -> ${report.roster.members} members  [MEMBERS mode, ${report.roster.assignmentId}]`,
    );

    console.log('\n=== form ===');
    console.log(`  ${FORM_NAME}`);
    console.log(`  ${report.form.action}  [${report.form.formId}]`);

    // Read back through the same joins the app uses, so the check fails here
    // rather than on the screen.
    const verify = await client.query(
      `SELECT f.form_name, f.evaluation_type, f.status,
              COUNT(fq.form_question_id)::int AS questions,
              SUM(fq.weight_percentage)::int  AS weight,
              COUNT(fq.snapshot_text)::int    AS snapshotted
         FROM appraisal_forms f
         LEFT JOIN appraisal_form_questions fq ON fq.form_id = f.form_id
        WHERE f.form_name = $1
        GROUP BY f.form_id, f.form_name, f.evaluation_type, f.status`,
      [FORM_NAME],
    );
    console.log('\n=== verification: form ===');
    console.table(verify.rows);

    const roster = await client.query(
      `SELECT u.email, u.first_name || ' ' || u.last_name AS name,
              d.title AS designation, u.status
         FROM team_lead_assignment_members m
         JOIN users u ON u.user_id = m.user_id
         LEFT JOIN designations d ON d.designation_id = u.designation_id
        WHERE m.assignment_id = $1
        ORDER BY u.employee_code`,
      [assignmentId],
    );
    console.log('=== verification: who the lead can evaluate ===');
    console.table(roster.rows);

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
