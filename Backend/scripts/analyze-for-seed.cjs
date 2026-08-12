// Read-only. Prints the COMPACT set of facts needed to write a correct
// wipe+seed: required insert columns, enum values, CHECK constraints, current
// users, the Admin role's permission coverage, and any FK from a PRESERVED
// table into a table we intend to WIPE (those refs must be nulled first).
//
//   node scripts/analyze-for-seed.cjs
require('dotenv').config();
const { Client } = require('pg');

function dbConfig() {
  const s = (n, f) => process.env[n] || f;
  return {
    host: s('DB_HOST', 'localhost'),
    port: Number(s('DB_PORT', '5432')),
    user: s('DB_USER', 'postgres'),
    password: s('DB_PASSWORD', 'admin'),
    database: s('DB_NAME', 'HR'),
  };
}

const PRESERVED = [
  'roles', 'permissions', 'role_permissions', 'migrations',
  'company_settings', 'smtp_settings', 'email_templates',
  'leave_types', 'working_day_schedules',
];

const INSERT_TARGETS = [
  'users', 'departments', 'designations', 'shifts', 'job_categories',
  'attendance', 'leave_requests', 'leave_entitlements', 'leave_history',
  'user_leave_balances', 'notifications', 'meetings', 'meeting_participants',
  'employee_loans', 'loan_installments', 'holidays',
  'appraisal_questions', 'appraisal_question_options',
  'appraisal_forms', 'appraisal_form_questions', 'appraisal_form_assignments',
  'team_lead_assignments', 'team_lead_assignment_members',
  'performance_reviews', 'performance_review_answers', 'review_approvals',
];

(async () => {
  const c = new Client(dbConfig());
  await c.connect();

  // 1. Required columns (NOT NULL, no default) for each insert target
  console.log('=== REQUIRED columns per insert target (NOT NULL, no default) ===');
  for (const t of INSERT_TARGETS) {
    const { rows } = await c.query(
      `SELECT column_name, udt_name, character_maximum_length AS len
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
          AND is_nullable='NO' AND column_default IS NULL
        ORDER BY ordinal_position`, [t]);
    const cols = rows.map((r) => `${r.column_name}:${r.udt_name}${r.len ? '(' + r.len + ')' : ''}`);
    console.log(`  ${t}: ${cols.join(', ') || '(none — all have defaults/nullable)'}`);
  }

  // 2. Enum types + labels
  console.log('\n=== ENUM types ===');
  const { rows: enums } = await c.query(
    `SELECT t.typname, string_agg(e.enumlabel, ' | ' ORDER BY e.enumsortorder) AS labels
       FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
       JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`);
  for (const e of enums) console.log(`  ${e.typname} = ${e.labels}`);

  // 3. CHECK constraints for insert targets (excludes NOT NULL)
  console.log('\n=== CHECK constraints (insert targets) ===');
  const { rows: checks } = await c.query(
    `SELECT tc.table_name, cc.check_clause
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON tc.constraint_name=cc.constraint_name AND tc.constraint_schema=cc.constraint_schema
      WHERE tc.table_schema='public' AND tc.constraint_type='CHECK'
        AND cc.check_clause NOT LIKE '%IS NOT NULL%'
        AND tc.table_name = ANY($1)
      ORDER BY tc.table_name`, [INSERT_TARGETS]);
  for (const ck of checks) console.log(`  ${ck.table_name}: ${ck.check_clause}`);

  // 4. Current users
  console.log('\n=== current users ===');
  const { rows: users } = await c.query(
    `SELECT u.user_id, u.employee_code, u.first_name, u.last_name, u.email, r.role_name, u.status
       FROM users u LEFT JOIN roles r ON r.role_id=u.role_id ORDER BY r.role_name`);
  for (const u of users)
    console.log(`  [${u.role_name}] ${u.first_name} ${u.last_name} <${u.email}> code=${u.employee_code} status=${u.status} id=${u.user_id}`);

  // 5. Role permission coverage vs total permissions
  console.log('\n=== role permission coverage (of 163) ===');
  const { rows: cov } = await c.query(
    `SELECT r.role_id, r.role_name, COUNT(rp.permission_id)::int AS perms
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.role_id
      GROUP BY r.role_id, r.role_name ORDER BY perms DESC`);
  for (const r of cov) console.log(`  ${r.role_name.padEnd(12)} ${r.perms} perms  id=${r.role_id}`);

  // 6. Preserved tables with a FK into a table we plan to WIPE (dangling risk)
  console.log('\n=== PRESERVED -> WIPED foreign keys (must null/handle before delete) ===');
  const { rows: fks } = await c.query(
    `SELECT tc.table_name AS child, kcu.column_name AS child_col,
            ccu.table_name AS parent, rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
       JOIN information_schema.referential_constraints rc ON tc.constraint_name=rc.constraint_name
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
        AND tc.table_name = ANY($1)          -- child is preserved
        AND ccu.table_name <> ALL($1)        -- parent is NOT preserved (will be wiped)
      ORDER BY tc.table_name`, [PRESERVED]);
  if (!fks.length) console.log('  (none)');
  for (const f of fks) console.log(`  ${f.child}.${f.child_col} -> ${f.parent}  ON DELETE ${f.delete_rule}`);

  // 7. Column presence sanity: does users have the full profile column set?
  console.log('\n=== users columns (for full-profile insert) ===');
  const { rows: uc } = await c.query(
    `SELECT column_name, udt_name, is_nullable,
            (column_default IS NOT NULL) AS has_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position`);
  console.log('  ' + uc.map((r) => r.column_name).join(', '));

  await c.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
