// ============================================================================
// Destructive reset: strip the database back to one admin user.
//
// KEEPS  roles, permissions, role_permissions, and configuration that would
//        otherwise have to be rebuilt by hand (company settings, SMTP, email
//        templates, leave types, working days, holidays) plus exactly one
//        admin account.
// WIPES  every other user and all people-shaped data (attendance, payroll,
//        leave, appraisals, reviews, meetings, documents, notifications,
//        audit trail, sessions) and the org structure (departments,
//        designations, shifts, job categories).
//
// Runs in a single transaction: it either completes or leaves the database
// exactly as it was. Take a backup first (scripts/backup-db.cjs).
//
//   node scripts/reset-to-single-admin.cjs --dry-run   # report only
//   node scripts/reset-to-single-admin.cjs --confirm   # actually delete
// ============================================================================
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

/** The survivor. */
const KEEP_USER_ID = '5269a7da-0db6-49b8-97eb-c2d482cb611a';

/**
 * Deleted in FK-safe order. Most of these cascade off `users` anyway, but
 * naming them explicitly means the row counts below are honest rather than
 * "0, because something else already took them".
 */
const WIPE_TABLES = [
  // Sessions and credentials trail
  'refresh_tokens',
  'password_reset_tokens',
  'password_history',
  'email_queue',
  'email_template_versions',
  'audit_logs',
  // Appraisal + performance
  'performance_review_answers',
  'review_approvals',
  'performance_reviews',
  'appraisal_notifications',
  'appraisal_form_assignments',
  'team_lead_assignment_members',
  'team_lead_assignments',
  'appraisal_form_questions',
  'appraisal_forms',
  'appraisal_question_options',
  'appraisal_questions',
  // HR operational
  'payroll',
  'user_leave_balances',
  'leave_history',
  'leave_entitlements',
  'leave_requests',
  'attendance',
  'notifications',
  'employee_documents',
  'meeting_participants',
  'meetings',
];

/** Org structure — wiped after users are detached from it. */
const REFERENCE_TABLES = ['designations', 'departments', 'shifts', 'job_categories'];

const PRESERVED = [
  'roles',
  'permissions',
  'role_permissions',
  'company_settings',
  'smtp_settings',
  'email_templates',
  'leave_types',
  'working_day_schedules',
  'holidays',
  'migrations',
];

function readDataSourceConfig() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data-source.ts'), 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*'([^']*)'`));
    return m ? m[1] : undefined;
  };
  const port = src.match(/port:\s*(\d+)/);
  return {
    host: pick('host'),
    port: port ? Number(port[1]) : 5432,
    user: pick('username'),
    password: pick('password'),
    database: pick('database'),
  };
}

const confirmed = process.argv.includes('--confirm');

(async () => {
  const client = new Client(readDataSourceConfig());
  await client.connect();

  const { rows: keep } = await client.query(
    `SELECT u.user_id, u.employee_code, u.first_name, u.last_name, u.email, r.role_name
       FROM users u LEFT JOIN roles r ON r.role_id = u.role_id
      WHERE u.user_id = $1`,
    [KEEP_USER_ID],
  );
  if (!keep.length) throw new Error(`Keeper ${KEEP_USER_ID} not found — refusing to run.`);
  const k = keep[0];
  console.log(`Keeping: ${k.first_name} ${k.last_name} <${k.email}> ` +
    `[${k.employee_code}] role=${k.role_name}\n`);

  await client.query('BEGIN');
  const deleted = [];

  for (const table of WIPE_TABLES) {
    const res = await client.query(`DELETE FROM "${table}"`);
    deleted.push([table, res.rowCount]);
  }

  // Detach the survivor from org rows that are about to disappear, and from a
  // team lead who is about to be deleted.
  await client.query(
    `UPDATE users SET department_id = NULL, designation_id = NULL, shift_id = NULL,
            job_category_id = NULL, team_lead_id = NULL
      WHERE user_id = $1`,
    [KEEP_USER_ID],
  );

  const users = await client.query(`DELETE FROM users WHERE user_id <> $1`, [KEEP_USER_ID]);
  deleted.push(['users', users.rowCount]);

  for (const table of REFERENCE_TABLES) {
    const res = await client.query(`DELETE FROM "${table}"`);
    deleted.push([table, res.rowCount]);
  }

  const width = Math.max(...deleted.map(([t]) => t.length));
  console.log('=== rows deleted ===');
  let total = 0;
  for (const [table, n] of deleted) {
    total += n;
    console.log(`${table.padEnd(width)}  ${String(n).padStart(6)}`);
  }
  console.log(`${'TOTAL'.padEnd(width)}  ${String(total).padStart(6)}`);

  console.log('\n=== preserved ===');
  for (const table of PRESERVED) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
    console.log(`${table.padEnd(width)}  ${String(rows[0].n).padStart(6)}`);
  }

  if (confirmed) {
    await client.query('COMMIT');
    console.log('\nCOMMITTED.');
  } else {
    await client.query('ROLLBACK');
    console.log('\nROLLED BACK (dry run). Re-run with --confirm to apply.');
  }

  await client.end();
})().catch(async (e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
