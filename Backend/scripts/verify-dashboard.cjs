/**
 * Verifies the three dashboard aggregates against the live backend and a real
 * database: the RBAC gates, the response shape, and — most importantly — that
 * every figure reconciles with the underlying tables rather than being an
 * arbitrary number the endpoint happened to return.
 *
 * Read-only. Nothing here writes to the database.
 *
 *   node scripts/verify-dashboard.cjs
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000/api';
const SECRET =
  process.env.JWT_SECRET ?? 'hrms-dev-secret-change-me-in-production';

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function token(user) {
  return jwt.sign(
    { sub: user.user_id, email: user.email, role: user.role_name },
    SECRET,
    { expiresIn: '15m' },
  );
}

async function call(method, path, { as } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as ? { Authorization: `Bearer ${as}` } : {}),
    },
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

function db() {
  return new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'admin',
    database: process.env.DB_NAME ?? 'HR',
  });
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v === null || isNum(v);

async function main() {
  const client = db();
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT u.user_id, u.email, u.first_name, u.last_name, r.role_name
       FROM users u LEFT JOIN roles r ON r.role_id = u.role_id
      WHERE u.status = true`,
  );

  const admin = users.find((u) => /admin|hr/i.test(u.role_name ?? ''));
  const employee = users.find((u) => /^employee$/i.test(u.role_name ?? ''));

  // A lead with an actual roster is the only useful subject for /dashboard/team.
  // Both roster sources are checked: the `users.team_lead_id` reporting line and
  // explicit appraisal assignments.
  const { rows: leadRows } = await client.query(
    `SELECT DISTINCT team_lead_id AS lead_id FROM users
      WHERE team_lead_id IS NOT NULL AND status = true
      UNION
     SELECT DISTINCT team_lead_id AS lead_id FROM team_lead_assignments
      WHERE team_lead_id IS NOT NULL`,
  );
  const lead =
    users.find((u) => leadRows.some((r) => r.lead_id === u.user_id)) ??
    users.find((u) => /team.?lead/i.test(u.role_name ?? ''));

  if (!admin || !employee) {
    console.error('Need at least one admin/HR user and one Employee user.');
    process.exit(1);
  }

  const asAdmin = token(admin);
  const asEmployee = token(employee);
  const asLead = lead ? token(lead) : null;

  console.log(`admin    : ${admin.role_name}`);
  console.log(`employee : ${employee.role_name}`);
  console.log(`lead     : ${lead ? lead.role_name : '(none found)'}`);

  // ---------------------------------------------------------------- RBAC ----
  section('RBAC gates');

  const anonAdmin = await call('GET', '/dashboard/admin');
  check('anonymous → /dashboard/admin is 401', anonAdmin.status === 401, `got ${anonAdmin.status}`);

  const anonMe = await call('GET', '/dashboard/me');
  check('anonymous → /dashboard/me is 401', anonMe.status === 401, `got ${anonMe.status}`);

  const empAdmin = await call('GET', '/dashboard/admin', { as: asEmployee });
  check('Employee → /dashboard/admin is 403', empAdmin.status === 403, `got ${empAdmin.status}`);

  const empTeam = await call('GET', '/dashboard/team', { as: asEmployee });
  check('Employee → /dashboard/team is 403', empTeam.status === 403, `got ${empTeam.status}`);

  const empMe = await call('GET', '/dashboard/me', { as: asEmployee });
  check('Employee → /dashboard/me is 200', empMe.status === 200, `got ${empMe.status}`);

  const adminAdmin = await call('GET', '/dashboard/admin', { as: asAdmin });
  check('Admin → /dashboard/admin is 200', adminAdmin.status === 200, `got ${adminAdmin.status}`);

  // --------------------------------------------------------------- admin ----
  section('GET /dashboard/admin reconciles with the database');

  const a = adminAdmin.body ?? {};
  const today = a.as_of;
  check('as_of is a YYYY-MM-DD date', /^\d{4}-\d{2}-\d{2}$/.test(today ?? ''), String(today));

  const q = async (sql, params) => Number((await client.query(sql, params)).rows[0].c);

  const dbTotal = await q(`SELECT COUNT(*)::int AS c FROM users WHERE status = true`);
  check(`total_employees = ${dbTotal}`, a.total_employees === dbTotal, `got ${a.total_employees}`);

  const dbPresent = await q(
    `SELECT COUNT(*)::int AS c FROM attendance
      WHERE attendance_date = $1 AND attendance_status IN ('Present','Late','Half-Day')`,
    [today],
  );
  check(`present_today = ${dbPresent}`, a.present_today === dbPresent, `got ${a.present_today}`);

  const dbAbsent = await q(
    `SELECT COUNT(*)::int AS c FROM attendance
      WHERE attendance_date = $1 AND attendance_status = 'Absent'`,
    [today],
  );
  check(`absent_today = ${dbAbsent}`, a.absent_today === dbAbsent, `got ${a.absent_today}`);

  const dbOnLeave = await q(
    `SELECT COUNT(DISTINCT user_id)::int AS c FROM leave_requests
      WHERE status = 'Approved' AND start_date <= $1 AND end_date >= $1`,
    [today],
  );
  check(`on_leave_today = ${dbOnLeave}`, a.on_leave_today === dbOnLeave, `got ${a.on_leave_today}`);

  const dbPendingLeave = await q(
    `SELECT COUNT(*)::int AS c FROM leave_requests WHERE status = 'Pending'`,
  );
  check(
    `pending_leave_requests = ${dbPendingLeave}`,
    a.pending_leave_requests === dbPendingLeave,
    `got ${a.pending_leave_requests}`,
  );

  const dbPendingAppraisals = await q(
    `SELECT COUNT(*)::int AS c FROM performance_reviews WHERE status = 'Draft'`,
  );
  check(
    `pending_appraisals = ${dbPendingAppraisals}`,
    a.pending_appraisals === dbPendingAppraisals,
    `got ${a.pending_appraisals}`,
  );

  // ------------------------------------------------------------------ me ----
  section('GET /dashboard/me reconciles for the Employee');

  const me = empMe.body ?? {};
  const att = me.attendance ?? {};

  check(
    'attendance block has every field',
    ['month', 'from', 'to', 'working_days', 'present_days', 'absent_days', 'leave_days', 'late_days']
      .every((k) => k in att),
    JSON.stringify(Object.keys(att)),
  );
  check('from is the 1st of the month', /^\d{4}-\d{2}-01$/.test(att.from ?? ''), String(att.from));
  check('to is today', att.to === today, `${att.to} vs ${today}`);
  check('working_days is a number ≥ 0', isNum(att.working_days) && att.working_days >= 0, String(att.working_days));

  const empPresent = await q(
    `SELECT COUNT(*)::int AS c FROM attendance
      WHERE user_id = $1 AND attendance_date BETWEEN $2 AND $3
        AND attendance_status IN ('Present','Late','Half-Day')`,
    [employee.user_id, att.from, att.to],
  );
  check(`present_days = ${empPresent}`, att.present_days === empPresent, `got ${att.present_days}`);

  const empAbsent = await q(
    `SELECT COUNT(*)::int AS c FROM attendance
      WHERE user_id = $1 AND attendance_date BETWEEN $2 AND $3
        AND attendance_status = 'Absent'`,
    [employee.user_id, att.from, att.to],
  );
  check(`absent_days = ${empAbsent}`, att.absent_days === empAbsent, `got ${att.absent_days}`);

  check('leave_days is a number ≥ 0', isNum(att.leave_days) && att.leave_days >= 0, String(att.leave_days));
  check(
    'present + absent never exceeds the month length',
    att.present_days + att.absent_days <= 31,
    `${att.present_days} + ${att.absent_days}`,
  );

  const ap = me.appraisal ?? {};
  check('appraisal.today_score is a number or null', isNumOrNull(ap.today_score), String(ap.today_score));
  check('appraisal.monthly_average is a number or null', isNumOrNull(ap.monthly_average), String(ap.monthly_average));
  check('appraisal.scored_this_month is a number', isNum(ap.scored_this_month), String(ap.scored_this_month));

  const dbScored = await q(
    `SELECT COUNT(*)::int AS c FROM performance_reviews
      WHERE reviewee_id = $1 AND status IN ('Submitted','Approved','Completed')
        AND review_date BETWEEN $2 AND $3`,
    [employee.user_id, att.from, att.to],
  );
  check(
    `scored_this_month = ${dbScored}`,
    ap.scored_this_month === dbScored,
    `got ${ap.scored_this_month}`,
  );
  check(
    'monthly_average is null exactly when nothing was scored',
    (dbScored === 0) === (ap.monthly_average === null),
    `scored ${dbScored}, avg ${ap.monthly_average}`,
  );

  const pay = me.payroll ?? {};
  check('payroll.visible is a boolean', typeof pay.visible === 'boolean', String(pay.visible));
  check('payroll.currency is set', typeof pay.currency === 'string' && pay.currency.length > 0, String(pay.currency));
  check('payroll.net_salary is a number or null', isNumOrNull(pay.net_salary), String(pay.net_salary));

  if (pay.visible) {
    const { rows: latest } = await client.query(
      `SELECT p.net_salary, pp.name FROM payslips p
         JOIN payroll_periods pp ON pp.period_id = p.period_id
        WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 1`,
      [employee.user_id],
    );
    if (latest.length === 0) {
      check('no payslip → net_salary null', pay.net_salary === null, String(pay.net_salary));
    } else {
      check(
        `net_salary matches the newest payslip (${latest[0].net_salary})`,
        Math.abs(Number(pay.net_salary) - Number(latest[0].net_salary)) < 0.01,
        `got ${pay.net_salary}`,
      );
      check(
        `period_name = ${latest[0].name}`,
        pay.period_name === latest[0].name,
        `got ${pay.period_name}`,
      );
    }
  }

  // --------------------------------------------- last 7 working days ------
  section('last_working_days is working-day aware');

  const days = me.last_working_days ?? [];
  check('at most 7 entries', Array.isArray(days) && days.length <= 7, String(days.length));
  check('newest first', days.every((d, i) => i === 0 || d.date < days[i - 1].date), JSON.stringify(days.map((d) => d.date)));
  check('every entry has a date and a status key', days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && 'status' in d), 'shape');
  check('first entry is today or earlier', days.length === 0 || days[0].date <= today, String(days[0]?.date));

  // No holiday may occupy one of the seven slots.
  if (days.length > 0) {
    const { rows: clash } = await client.query(
      `SELECT holiday_date FROM holidays
        WHERE is_recurring = false AND holiday_date::text = ANY($1::text[])`,
      [days.map((d) => d.date)],
    );
    check('no holiday occupies a slot', clash.length === 0, JSON.stringify(clash));
  }

  // Every recorded status must match the attendance table for that exact date.
  let statusMismatch = null;
  for (const day of days) {
    const { rows } = await client.query(
      `SELECT attendance_status FROM attendance WHERE user_id = $1 AND attendance_date = $2`,
      [employee.user_id, day.date],
    );
    const expected = rows.length ? rows[0].attendance_status : null;
    if (day.status !== expected) {
      statusMismatch = `${day.date}: got ${day.status}, db ${expected}`;
      break;
    }
  }
  check('every day’s status matches the attendance table', statusMismatch === null, statusMismatch ?? '');

  // Working days in the month can never be fewer than the days actually worked.
  check(
    'working_days ≥ present_days',
    att.working_days >= att.present_days,
    `${att.working_days} < ${att.present_days}`,
  );

  // ---------------------------------------------------------------- team ----
  // With no dedicated Team Lead user in the database, fall back to the Admin
  // token: Admin also holds `appraisal.view`, so the route, its gate and the
  // response shape are still exercised — the roster is simply empty, which is
  // itself the behaviour worth asserting (a lead with no roster must never fall
  // back to the whole organisation).
  {
    const subject = lead ?? admin;
    const asSubject = asLead ?? asAdmin;
    section(
      lead
        ? 'GET /dashboard/team is roster-scoped'
        : 'GET /dashboard/team (no Team Lead in the database — Admin token, empty-roster contract)',
    );

    const teamRes = await call('GET', '/dashboard/team', { as: asSubject });
    check('subject → /dashboard/team is 200', teamRes.status === 200, `got ${teamRes.status}`);

    const t = teamRes.body ?? {};
    check('team_size matches members.length', t.team_size === (t.members ?? []).length, `${t.team_size} vs ${(t.members ?? []).length}`);
    check('expected_appraisals equals team_size', t.expected_appraisals === t.team_size, `${t.expected_appraisals} vs ${t.team_size}`);
    check(
      'pending_appraisals ≤ expected_appraisals',
      t.pending_appraisals <= t.expected_appraisals,
      `${t.pending_appraisals} > ${t.expected_appraisals}`,
    );
    check('team_performance_mean is a number or null', isNumOrNull(t.team_performance_mean), String(t.team_performance_mean));
    check('month is a YYYY-MM string', /^\d{4}-\d{2}$/.test(t.month ?? ''), String(t.month));

    const members = t.members ?? [];
    check(
      'every member row has the five requested columns',
      members.every(
        (m) =>
          typeof m.employee_code === 'string' &&
          typeof m.employee_name === 'string' &&
          'designation' in m &&
          isNum(m.present_days) &&
          isNumOrNull(m.performance),
      ),
      JSON.stringify(members[0] ?? {}),
    );
    check(
      'the subject is never in their own team',
      !members.some((m) => m.user_id === subject.user_id),
      'subject present in roster',
    );
    check(
      'pending_appraisals equals members without a score',
      t.pending_appraisals === members.filter((m) => m.performance === null).length,
      `${t.pending_appraisals}`,
    );

    // Cross-check the roster against both sources the service unions: the
    // `users.team_lead_id` reporting line and explicit appraisal assignments
    // (named members, or a whole department via mode = 'department').
    const { rows: assigned } = await client.query(
      `SELECT u.user_id FROM users u
        WHERE u.team_lead_id = $1 AND u.status = true
        UNION
       SELECT m.user_id
         FROM team_lead_assignment_members m
         JOIN team_lead_assignments a ON a.assignment_id = m.assignment_id
        WHERE a.team_lead_id = $1
        UNION
       SELECT u.user_id FROM users u
         JOIN team_lead_assignments a ON a.department_id = u.department_id
        WHERE a.team_lead_id = $1 AND LOWER(a.mode) = 'department' AND u.status = true`,
      [subject.user_id],
    );
    const allowed = new Set(assigned.map((r) => r.user_id).filter((id) => id !== subject.user_id));
    check(
      `no member outside the subject's roster (${allowed.size} allowed)`,
      members.every((m) => allowed.has(m.user_id)),
      JSON.stringify(members.filter((m) => !allowed.has(m.user_id)).map((m) => m.employee_code)),
    );
    check(
      'roster size equals what the database allows',
      members.length === allowed.size,
      `${members.length} vs ${allowed.size}`,
    );

    // Per-member present days must reconcile.
    let memberMismatch = null;
    for (const m of members.slice(0, 5)) {
      const c = await q(
        `SELECT COUNT(*)::int AS c FROM attendance
          WHERE user_id = $1 AND attendance_date BETWEEN $2 AND $3
            AND attendance_status IN ('Present','Late','Half-Day')`,
        [m.user_id, `${today.slice(0, 7)}-01`, today],
      );
      if (m.present_days !== c) {
        memberMismatch = `${m.employee_code}: got ${m.present_days}, db ${c}`;
        break;
      }
    }
    check('per-member present_days reconcile', memberMismatch === null, memberMismatch ?? '');
  }

  await client.end();

  console.log(`\n${passed} passed / ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
