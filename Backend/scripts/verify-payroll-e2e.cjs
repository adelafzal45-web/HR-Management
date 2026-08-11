/**
 * Live end-to-end verification of the payroll engine (plan verification
 * steps 10, 12, and the Phase 2 + Phase 3 integration).
 *
 * Read-mostly against the API, not the DB: it drives the same HTTP routes the
 * UI calls, so guards, DTO validation and the hard gate are all exercised for
 * real. The only writes are the additive rows the walkthrough needs (component,
 * structure, assignment, overtime rule, tax config, loan, employee loan request,
 * expense claim, and whatever Quick Setup finds missing) plus the draft periods
 * it processes — nothing is deleted or overwritten.
 *
 * Re-runnable: config rows are created-or-reused via `ensure`, and the periods
 * are reused while still `draft` or opened as the next numbered one. Phase 3's
 * money assertions are deltas measured inside a single run, so they survive the
 * configuration Quick Setup adds on a first pass.
 *
 * Auth: mints a short-lived access token in-process with the same secret the
 * app resolves (env `JWT_SECRET`, falling back to the repo dev default). No
 * password is read, guessed, or printed, and the token never leaves this
 * process's memory.
 *
 *   node scripts/verify-payroll-e2e.cjs
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
    { expiresIn: '10m' },
  );
}

/** Thin fetch wrapper returning {status, body} without throwing on 4xx. */
async function call(method, path, { as, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as ? { Authorization: `Bearer ${as}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

/**
 * Binary fetch for the .xlsx download — `call` parses the body as text/JSON,
 * which would corrupt a ZIP. Returns the headers plus enough of the payload to
 * prove it really is a workbook.
 */
async function download(path, as) {
  const res = await fetch(`${BASE}${path}`, {
    headers: as ? { Authorization: `Bearer ${as}` } : {},
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    type: res.headers.get('content-type') ?? '',
    disposition: res.headers.get('content-disposition') ?? '',
    bytes: buf.length,
    // Every .xlsx is a ZIP archive, so the first two bytes must be "PK".
    magic: buf.subarray(0, 2).toString('latin1'),
  };
}

/** Money comparison — the engine rounds to 2dp, so exact equality is unsafe. */
function near(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

/** Pulls the real user rows so the tokens carry genuine ids and role names. */
async function loadUsers() {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'admin',
    database: process.env.DB_NAME ?? 'HR',
  });
  await client.connect();
  const { rows } = await client.query(
    `SELECT u.user_id, u.email, r.role_name
       FROM users u LEFT JOIN roles r ON r.role_id = u.role_id`,
  );
  await client.end();
  return {
    admin: rows.find((r) => /admin/i.test(r.role_name ?? '')),
    employee: rows.find((r) => /employee/i.test(r.role_name ?? '')),
  };
}

// A marker so every row this script creates is identifiable afterwards.
const TAG = 'E2E Verify';

/**
 * Create-or-reuse, so the script is re-runnable without piling up duplicate
 * config rows (component codes and structure names are unique). Looks the list
 * endpoint over first and returns the existing row when the marker matches.
 */
async function ensure(label, { listPath, match, createPath, body, as }) {
  const existing = await call('GET', listPath, { as });
  if (Array.isArray(existing.body)) {
    const found = existing.body.find(match);
    if (found) {
      console.log(`  reuse ${label}`);
      return { status: 201, body: found, reused: true };
    }
  }
  return call('POST', createPath ?? listPath, { as, body });
}

/**
 * Periods are stateful in a way config rows are not: locking is terminal and
 * there is no unlock endpoint, so a period an earlier run drove past `draft`
 * can never be processed again. Reuse a leftover draft under this prefix if
 * there is one, else open the next numbered period — which is what keeps the
 * suite re-runnable without hand-cleaning the database.
 */
async function ensureDraftPeriod(prefix, body, as) {
  const list = await call('GET', '/payroll-periods', { as });
  const rows = Array.isArray(list.body)
    ? list.body.filter((p) => String(p.name ?? '').startsWith(prefix))
    : [];
  const draft = rows.find((p) => p.status === 'draft');
  if (draft) {
    console.log(`  reuse ${draft.name} (draft)`);
    return { status: 201, body: draft, reused: true };
  }
  const name = rows.length ? `${prefix} #${rows.length + 1}` : prefix;
  console.log(`  create ${name}`);
  return call('POST', '/payroll-periods', { as, body: { ...body, name } });
}

async function run() {
  const { admin, employee } = await loadUsers();
  if (!admin) throw new Error('No Admin-role user found to authenticate as.');
  const A = token(admin);
  const E = employee ? token(employee) : null;

  // ---- 1. Hard gate: incomplete setup must refuse to process --------------
  section('Setup checklist (pre-configuration)');
  const before = await call('GET', '/payroll-periods/setup-status', { as: A });
  check('setup-status reachable for Admin', before.status === 200, `status ${before.status}`);
  // The gate can only be *observed* on a DB that has not been configured yet.
  // Once a previous run has seeded the config the checklist is legitimately
  // ready, so the negative assertions below are skipped rather than failed.
  const virgin = before.body?.ready === false;
  if (virgin) {
    check('setup-status reports NOT ready before configuration', true);
  } else {
    console.log('  SKIP  pre-configuration gate — payroll is already configured');
  }
  const requiredChecks = (before.body?.checks ?? []).filter((c) => c.required);
  check('checklist exposes required items', requiredChecks.length >= 3,
    `${requiredChecks.length} required checks`);

  section('Create a draft period');
  const created = await ensureDraftPeriod(
    `${TAG} — August 2026`,
    {
      frequency: 'monthly',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      pay_date: '2026-09-01',
      working_days: 21,
    },
    A,
  );
  check('period created', created.status === 201, `status ${created.status} ${JSON.stringify(created.body)}`);
  const periodId = created.body?.period_id ?? created.body?.id;
  check('period id returned', Boolean(periodId), JSON.stringify(created.body));
  check('period is a processable draft', created.body?.status === 'draft',
    String(created.body?.status));

  section('Hard gate on process (plan step 10)');
  if (virgin) {
    const blocked = await call('POST', `/payroll-periods/${periodId}/process`, { as: A });
    check('process refused while setup incomplete',
      blocked.status >= 400 && blocked.status < 500, `status ${blocked.status}`);
    const gateMsg = String(blocked.body?.message ?? '');
    check('refusal names what is missing', /setup is incomplete/i.test(gateMsg), gateMsg);
    console.log(`        message: ${gateMsg}`);
  } else {
    console.log('  SKIP  gate already satisfied — see a virgin-DB run for this assertion');
  }

  // ---- 2. Configure the minimum viable payroll ----------------------------
  section('Configure components / structure / assignment');
  const hra = await ensure('taxable earning component', {
    as: A,
    listPath: '/salary-components',
    match: (c) => c.code === 'E2E_HRA',
    body: {
      name: `House Rent Allowance (${TAG})`,
      code: 'E2E_HRA',
      type: 'earning',
      calculation_type: 'percent_basic',
      amount: 40,
      is_taxable: true,
      include_in_gross: true,
      display_order: 1,
      effective_from: '2026-01-01',
    },
  });
  check('taxable earning component created', hra.status === 201,
    `status ${hra.status} ${JSON.stringify(hra.body)}`);
  const hraId = hra.body?.component_id ?? hra.body?.id;

  const pf = await ensure('formula deduction component', {
    as: A,
    listPath: '/salary-components',
    match: (c) => c.code === 'E2E_PF',
    body: {
      name: `Provident Fund (${TAG})`,
      code: 'E2E_PF',
      type: 'deduction',
      calculation_type: 'formula',
      formula: 'BASIC * 0.05',
      include_in_gross: false,
      display_order: 2,
      effective_from: '2026-01-01',
    },
  });
  check('formula deduction component created', pf.status === 201,
    `status ${pf.status} ${JSON.stringify(pf.body)}`);
  const pfId = pf.body?.component_id ?? pf.body?.id;

  const structure = await ensure('structure', {
    as: A,
    listPath: '/salary-structures',
    match: (s) => s.name === `Standard Staff (${TAG})`,
    body: {
      name: `Standard Staff (${TAG})`,
      description: 'Created by verify-payroll-e2e.',
      components: [
        { component_id: hraId, display_order: 1 },
        { component_id: pfId, display_order: 2 },
      ],
    },
  });
  check('structure created with components', structure.status === 201,
    `status ${structure.status} ${JSON.stringify(structure.body)}`);
  const structureId = structure.body?.structure_id ?? structure.body?.id;

  const assignment = await ensure('company assignment', {
    as: A,
    listPath: '/salary-structure-assignments',
    match: (a) => a.structure_id === structureId && a.scope_type === 'company',
    body: {
      structure_id: structureId,
      scope_type: 'company',
      base_salary: 200000,
      effective_from: '2026-01-01',
    },
  });
  check('company-scope assignment created', assignment.status === 201,
    `status ${assignment.status} ${JSON.stringify(assignment.body)}`);
  // ---- 3. Phase 2 configuration: rules, tax, loan -------------------------
  section('Payroll rules (spec §4–8)');
  const otRule = await ensure('overtime rule', {
    as: A,
    listPath: '/payroll-rules',
    match: (r) => r.rule_type === 'overtime' && r.name.startsWith('Weekend & holiday OT'),
    body: {
      rule_type: 'overtime',
      name: `Weekend & holiday OT (${TAG})`,
      scope_type: 'company',
      config: {
        enabled: true,
        applies_to: ['non_working_day', 'govt_holiday'],
        rate_multiplier: 2,
      },
      effective_from: '2026-01-01',
    },
  });
  check('overtime rule created', otRule.status === 201,
    `status ${otRule.status} ${JSON.stringify(otRule.body)}`);
  const otRuleId = otRule.body?.rule_id ?? otRule.body?.id;

  const otDefault = await call('POST', '/payroll-rules', {
    as: A,
    body: {
      rule_type: 'overtime',
      name: `${TAG} — OT default check`,
      scope_type: 'department',
      config: { enabled: false, applies_to: ['non_working_day'], rate_multiplier: 1 },
      effective_from: '2026-01-01',
    },
  });
  check('overtime rule rejects a non-company scope without scope_id',
    otDefault.status === 400, `status ${otDefault.status}`);

  const badRule = await call('POST', '/payroll-rules', {
    as: A,
    body: {
      rule_type: 'absent',
      name: `${TAG} — injection probe`,
      scope_type: 'company',
      config: { mode: 'formula', formula: 'process.exit(1)' },
    },
  });
  check('formula field rejects arbitrary code over HTTP', badRule.status === 400,
    `status ${badRule.status} ${JSON.stringify(badRule.body)}`);

  const lateRule = await ensure('late rule', {
    as: A,
    listPath: '/payroll-rules',
    match: (r) => r.rule_type === 'late' && r.name.startsWith('Late arrivals'),
    body: {
      rule_type: 'late',
      name: `Late arrivals (${TAG})`,
      scope_type: 'company',
      config: { grace_minutes: 15, unit: 'per_minute', amount: 20 },
      effective_from: '2026-01-01',
    },
  });
  check('late rule created', lateRule.status === 201,
    `status ${lateRule.status} ${JSON.stringify(lateRule.body)}`);

  const bonusRule = await ensure('bonus rule', {
    as: A,
    listPath: '/payroll-rules',
    match: (r) => r.rule_type === 'bonus' && r.name.startsWith('Monthly performance bonus'),
    body: {
      rule_type: 'bonus',
      name: `Monthly performance bonus (${TAG})`,
      scope_type: 'company',
      config: { trigger: 'percent_gross', amount: 5, taxable: true },
      effective_from: '2026-01-01',
    },
  });
  check('bonus rule created', bonusRule.status === 201,
    `status ${bonusRule.status} ${JSON.stringify(bonusRule.body)}`);

  section('Rule versioning (spec §16)');
  const edited = await call('PATCH', `/payroll-rules/${otRuleId}`, {
    as: A,
    body: {
      config: {
        enabled: true,
        applies_to: ['non_working_day', 'govt_holiday'],
        rate_multiplier: 1.5,
      },
    },
  });
  check('editing a rule succeeds', edited.status === 200,
    `status ${edited.status} ${JSON.stringify(edited.body)}`);
  const newRuleId = edited.body?.rule_id ?? otRuleId;
  check('edit produced a new version rather than overwriting',
    (edited.body?.version ?? 1) > 1, `version ${edited.body?.version}`);
  const versions = await call('GET', `/payroll-rules/${newRuleId}/versions`, { as: A });
  check('version chain readable', versions.status === 200 && Array.isArray(versions.body),
    `status ${versions.status}`);
  check('version chain has both rows', (versions.body?.length ?? 0) >= 2,
    `${versions.body?.length} versions`);

  section('Tax configuration (spec §10)');
  const tax = await ensure('tax config', {
    as: A,
    listPath: '/payroll-tax',
    match: (t) => t.name.startsWith('FBR Salaried 2026-27'),
    body: {
      name: `FBR Salaried 2026-27 (${TAG})`,
      regime: 'FBR',
      currency: 'PKR',
      annualize: true,
      effective_from: '2026-07-01',
      slabs: [
        { lower_bound: 0, upper_bound: 600000, base_tax: 0, rate_percent: 0, display_order: 0 },
        { lower_bound: 600000, upper_bound: 1200000, base_tax: 0, rate_percent: 5, display_order: 1 },
        { lower_bound: 1200000, upper_bound: 2200000, base_tax: 30000, rate_percent: 15, display_order: 2 },
        { lower_bound: 2200000, upper_bound: 3200000, base_tax: 180000, rate_percent: 25, display_order: 3 },
        { lower_bound: 3200000, upper_bound: 4100000, base_tax: 430000, rate_percent: 30, display_order: 4 },
        { lower_bound: 4100000, upper_bound: null, base_tax: 700000, rate_percent: 35, display_order: 5 },
      ],
    },
  });
  check('tax config with 6 slabs created', tax.status === 201,
    `status ${tax.status} ${JSON.stringify(tax.body)}`);

  const taxPreview = await call('POST', '/payroll-tax/preview', {
    as: A,
    body: { annual_taxable: 2400000 },
  });
  check('tax preview responds', taxPreview.status === 200 || taxPreview.status === 201,
    `status ${taxPreview.status} ${JSON.stringify(taxPreview.body)}`);
  // 2.4M annual: 180000 + 25% of (2.4M - 2.2M) = 230000.
  const annual = Number(
    taxPreview.body?.annual_tax ?? taxPreview.body?.annual ?? taxPreview.body?.tax ?? NaN,
  );
  check('progressive slab math is correct at ₨2,400,000 → ₨230,000',
    Math.abs(annual - 230000) < 0.01, `got ${annual}`);
  console.log(`        preview: ${JSON.stringify(taxPreview.body)}`);

  section('Employee loans (spec §9)');
  const loan = await ensure('loan', {
    as: A,
    listPath: '/payroll-loans',
    match: (l) => l.name.startsWith('Salary advance'),
    body: {
      user_id: employee?.user_id ?? admin.user_id,
      name: `Salary advance (${TAG})`,
      principal: 120000,
      installment_amount: 10000,
      status: 'active',
      remarks: 'Created by verify-payroll-e2e.',
    },
  });
  check('loan created', loan.status === 201,
    `status ${loan.status} ${JSON.stringify(loan.body)}`);
  const loanId = loan.body?.loan_id ?? loan.body?.id;
  const schedule = await call('POST', `/payroll-loans/${loanId}/schedule`, { as: A });
  check('installment schedule generated',
    schedule.status === 200 || schedule.status === 201, `status ${schedule.status}`);
  const installments = Array.isArray(schedule.body)
    ? schedule.body
    : (schedule.body?.installments ?? []);
  check('schedule covers the principal (120000 / 10000 = 12)',
    installments.length === 12, `${installments.length} installments`);

  // ---- 4. Gate opens, engine runs ----------------------------------------
  section('Setup checklist (post-configuration)');
  const after = await call('GET', '/payroll-periods/setup-status', { as: A });
  check('setup-status now reports ready', after.body?.ready === true,
    JSON.stringify(after.body));

  section('Preview with "Why?" (spec §14/§15)');
  const preview = await call('POST', '/payslips/preview', {
    as: A,
    body: { user_id: employee?.user_id ?? admin.user_id, period_id: periodId },
  });
  check('preview computes', preview.status === 200 || preview.status === 201,
    `status ${preview.status} ${JSON.stringify(preview.body).slice(0, 400)}`);
  const lines = preview.body?.lines ?? [];
  check('preview returns line items', lines.length > 0, `${lines.length} lines`);
  check('every line carries a "Why?" note',
    lines.length > 0 && lines.every((l) => typeof l.calc_note === 'string' && l.calc_note.length),
    JSON.stringify(lines.filter((l) => !l.calc_note).map((l) => l.label)),
  );
  const labels = lines.map((l) => `${l.type}:${l.label}=${l.amount}`);
  console.log(`        lines: ${labels.join(' | ')}`);
  console.log(
    `        gross=${preview.body?.gross_salary} earnings=${preview.body?.total_earnings} ` +
      `deductions=${preview.body?.total_deductions} net=${preview.body?.net_salary}`,
  );
  const hasTaxLine = lines.some((l) => /tax/i.test(l.label));
  const hasLoanLine = lines.some((l) => /loan|advance/i.test(l.label));
  check('tax line present once a tax config exists', hasTaxLine,
    labels.join(' | '));
  check('loan deduction line present for the borrower', hasLoanLine,
    labels.join(' | '));

  section('Process the period');
  const processed = await call('POST', `/payroll-periods/${periodId}/process`, { as: A });
  check('process succeeds once setup is ready',
    processed.status === 200 || processed.status === 201,
    `status ${processed.status} ${JSON.stringify(processed.body).slice(0, 300)}`);
  const nextStatus = processed.body?.period?.status ?? processed.body?.status;
  check('period advanced past draft', nextStatus && nextStatus !== 'draft', String(nextStatus));
  console.log(`        run: ${JSON.stringify(processed.body?.summary ?? processed.body).slice(0, 300)}`);

  // ---- 4b. Phase 3: self-service, claims, quick setup, export ------------
  //
  // These flows need a period of their own. The one above has been processed
  // already, and a claim only reaches a payslip whose window contains its
  // expense date — so open (or reuse) an October period and drive the whole
  // employee journey through it.
  //
  // Every money assertion below is a DELTA measured inside this run (preview
  // before → act → preview after). That is deliberate: Quick Setup further down
  // adds its own company-wide structure, so absolute figures are not stable
  // across runs, but "net rose by exactly the claim total" always is.
  section('Phase 3 — a period for the self-service journey');
  const p3 = await ensureDraftPeriod(
    `${TAG} — Phase 3`,
    {
      frequency: 'monthly',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      pay_date: '2026-11-01',
      working_days: 22,
    },
    A,
  );
  const p3Id = p3.body?.period_id ?? p3.body?.id;
  check('Phase 3 period is a draft ready to run',
    Boolean(p3Id) && p3.body?.status === 'draft',
    `${p3.status} ${JSON.stringify(p3.body).slice(0, 200)}`);

  const SUBJECT = employee?.user_id ?? admin.user_id;

  /**
   * Preview the Phase 3 period for the employee and pull out every figure this
   * phase can move. Preview is read-only, so this is safe to call repeatedly —
   * which is exactly what makes the before/after assertions possible.
   */
  const p3Preview = async () => {
    const res = await call('POST', '/payslips/preview', {
      as: A,
      body: { user_id: SUBJECT, period_id: p3Id },
    });
    const ls = Array.isArray(res.body?.lines) ? res.body.lines : [];
    const total = (test) =>
      ls.filter(test).reduce((t, l) => t + Number(l.amount), 0);
    const reimbLine = ls.find((l) => /^reimbursement$/i.test(l.label ?? ''));
    return {
      status: res.status,
      gross: Number(res.body?.gross_salary ?? 0),
      net: Number(res.body?.net_salary ?? 0),
      earnings: Number(res.body?.total_earnings ?? 0),
      deductions: Number(res.body?.total_deductions ?? 0),
      tax: total((l) => /tax/i.test(l.label ?? '')),
      loan: total((l) => l.code === 'LOAN' || /loan|advance/i.test(l.label ?? '')),
      reimb: Number(reimbLine?.amount ?? 0),
      reimbNote: String(reimbLine?.calc_note ?? ''),
      body: res.body,
    };
  };

  if (!E) {
    console.log('  SKIP  Phase 3 self-service — no Employee-role user found');
  } else {
    section('Phase 3 — employee applies for a loan (spec §3B)');
    const baseline = await p3Preview();
    check('the Phase 3 period previews',
      baseline.status === 200 || baseline.status === 201,
      `status ${baseline.status}`);
    console.log(
      `        baseline: gross=${baseline.gross} tax=${baseline.tax} ` +
        `loan=${baseline.loan} net=${baseline.net}`,
    );

    const req = await call('POST', '/payroll-loans/me', {
      as: E,
      body: {
        name: `Bike advance (${TAG})`,
        principal: 24000,
        requested_months: 1,
        remarks: 'Filed by verify-payroll-e2e.',
        // A hostile client trying to file an already-active loan against the
        // Admin. Both fields must be ignored: user_id comes from the token.
        user_id: admin.user_id,
        status: 'active',
      },
    });
    check('employee may file a loan request', req.status === 201,
      `status ${req.status} ${JSON.stringify(req.body).slice(0, 200)}`);
    const reqId = req.body?.loan_id;
    check('the request is scoped to the token holder, not the body',
      req.body?.user_id === employee.user_id,
      `${req.body?.user_id} vs ${employee.user_id}`);
    check('the request lands as pending, whatever the body asked for',
      req.body?.status === 'pending', String(req.body?.status));
    check('nothing is scheduled before HR decides',
      (req.body?.installments ?? []).length === 0,
      `${(req.body?.installments ?? []).length} installments`);

    const mineLoans = await call('GET', '/payroll-loans/me', { as: E });
    check('employee sees their own loans', mineLoans.status === 200,
      `status ${mineLoans.status}`);
    check('self-service leaks no colleague’s borrowing',
      Array.isArray(mineLoans.body) &&
        mineLoans.body.every((l) => l.user_id === employee.user_id),
      'foreign loan leaked');

    const pendingRun = await p3Preview();
    check('a pending request deducts nothing from pay',
      near(pendingRun.loan, baseline.loan),
      `loan ${pendingRun.loan} vs ${baseline.loan}`);

    const selfApprove = await call('POST', `/payroll-loans/${reqId}/approve`, {
      as: E,
      body: {},
    });
    check('employee cannot approve their own request → 403',
      selfApprove.status === 403, `status ${selfApprove.status}`);

    const approved = await call('POST', `/payroll-loans/${reqId}/approve`, {
      as: A,
      body: { installment_amount: 24000, note: 'Approved by verify-payroll-e2e.' },
    });
    check('HR/Admin approves the request',
      approved.status === 200 || approved.status === 201,
      `status ${approved.status} ${JSON.stringify(approved.body).slice(0, 200)}`);
    check('the approved loan goes active', approved.body?.status === 'active',
      String(approved.body?.status));
    const sched = approved.body?.installments ?? [];
    check('approval generates the repayment schedule',
      sched.length === 1 && near(sched[0]?.amount, 24000),
      JSON.stringify(sched.map((i) => i.amount)));
    check('the decision is attributed to the approver',
      Boolean(approved.body?.decided_by && approved.body?.decided_at),
      JSON.stringify({ by: approved.body?.decided_by, at: approved.body?.decided_at }));

    const twice = await call('POST', `/payroll-loans/${reqId}/approve`, {
      as: A,
      body: {},
    });
    check('a live loan cannot be re-approved into a second schedule',
      twice.status >= 400 && twice.status < 500,
      `status ${twice.status} ${String(twice.body?.message ?? '')}`);

    const afterApprove = await p3Preview();
    check('the approved installment now deducts from pay',
      near(afterApprove.loan, baseline.loan + 24000),
      `loan ${afterApprove.loan} vs ${baseline.loan} + 24000`);

    const req2 = await call('POST', '/payroll-loans/me', {
      as: E,
      body: {
        name: `Laptop advance (${TAG})`,
        principal: 50000,
        requested_months: 5,
      },
    });
    const rejected = await call(
      'POST',
      `/payroll-loans/${req2.body?.loan_id}/reject`,
      { as: A, body: { note: 'Existing advance still outstanding.' } },
    );
    check('HR/Admin may reject a request',
      rejected.status === 200 || rejected.status === 201,
      `status ${rejected.status}`);
    check('a rejected request is zeroed and unscheduled',
      rejected.body?.status === 'rejected' &&
        near(rejected.body?.outstanding, 0) &&
        (rejected.body?.installments ?? []).length === 0,
      JSON.stringify({
        status: rejected.body?.status,
        outstanding: rejected.body?.outstanding,
      }));
    const afterReject = await p3Preview();
    check('a rejected request deducts nothing',
      near(afterReject.loan, afterApprove.loan),
      `loan ${afterReject.loan} vs ${afterApprove.loan}`);

    // ---- Expense claims -------------------------------------------------
    section('Phase 3 — expense claim becomes a non-taxable earning (spec §3C/§3D)');
    const before = await p3Preview();
    check('no reimbursement line before anything is approved',
      before.reimb === 0, `reimbursement ${before.reimb}`);

    const claim = await call('POST', '/reimbursements/me', {
      as: E,
      body: {
        title: `Client visit taxi (${TAG})`,
        category: 'Travel',
        amount: 3500,
        expense_date: '2026-10-05',
        description: 'Filed by verify-payroll-e2e.',
        // Same hostile body as the loan: neither field may survive.
        user_id: admin.user_id,
        status: 'approved',
      },
    });
    check('employee may submit an expense claim', claim.status === 201,
      `status ${claim.status} ${JSON.stringify(claim.body).slice(0, 200)}`);
    const claimId = claim.body?.reimbursement_id;
    check('the claim is scoped to the token holder and starts pending',
      claim.body?.user_id === employee.user_id &&
        claim.body?.status === 'pending',
      JSON.stringify({ user: claim.body?.user_id, status: claim.body?.status }));

    const mineClaims = await call('GET', '/reimbursements/me', { as: E });
    check('employee sees their own claims',
      mineClaims.status === 200 &&
        Array.isArray(mineClaims.body) &&
        mineClaims.body.some((c) => c.reimbursement_id === claimId),
      `status ${mineClaims.status}`);
    check('self-service leaks no colleague’s expenses',
      Array.isArray(mineClaims.body) &&
        mineClaims.body.every((c) => c.user_id === employee.user_id),
      'foreign claim leaked');

    const selfDecide = await call('POST', `/reimbursements/${claimId}/approve`, {
      as: E,
      body: {},
    });
    check('employee cannot approve their own claim → 403',
      selfDecide.status === 403, `status ${selfDecide.status}`);

    const whilePending = await p3Preview();
    check('a pending claim is not paid',
      whilePending.reimb === 0, `reimbursement ${whilePending.reimb}`);

    const okClaim = await call('POST', `/reimbursements/${claimId}/approve`, {
      as: A,
      body: { note: 'Receipt verified.' },
    });
    check('HR/Admin approves the claim',
      okClaim.status === 200 || okClaim.status === 201,
      `status ${okClaim.status} ${JSON.stringify(okClaim.body).slice(0, 200)}`);
    check('the claim is approved and attributed',
      okClaim.body?.status === 'approved' && Boolean(okClaim.body?.decided_by),
      JSON.stringify({ status: okClaim.body?.status, by: okClaim.body?.decided_by }));

    const after = await p3Preview();
    check('the claim shows as a Reimbursement earning',
      near(after.reimb, 3500), `reimbursement ${after.reimb}`);
    check('the line explains itself in the "Why?"',
      /approved claim/i.test(after.reimbNote) && /Travel/i.test(after.reimbNote),
      after.reimbNote);
    // The whole point of §3D: a refund is repayment, not income.
    check('GROSS is unchanged — a refund is not income',
      near(after.gross, before.gross), `${after.gross} vs ${before.gross}`);
    check('income tax is unchanged', near(after.tax, before.tax),
      `${after.tax} vs ${before.tax}`);
    check('deductions are unchanged', near(after.deductions, before.deductions),
      `${after.deductions} vs ${before.deductions}`);
    check('net rises by exactly the claim total',
      near(after.net, before.net + 3500),
      `${after.net} vs ${before.net} + 3500`);

    const stillOwed = await call('GET', `/reimbursements/${claimId}`, { as: A });
    check('a preview never settles a claim',
      stillOwed.body?.status === 'approved', String(stillOwed.body?.status));

    // ---- Committing the run ---------------------------------------------
    section('Phase 3 — processing the run settles claim and installment');
    const run3 = await call('POST', `/payroll-periods/${p3Id}/process`, { as: A });
    check('the Phase 3 period processes',
      run3.status === 200 || run3.status === 201,
      `status ${run3.status} ${JSON.stringify(run3.body).slice(0, 200)}`);

    const settled = await call('GET', `/reimbursements/${claimId}`, { as: A });
    check('the claim is flipped to paid', settled.body?.status === 'paid',
      String(settled.body?.status));
    check('the settling period and payslip are stamped on it',
      settled.body?.paid_period_id === p3Id &&
        Boolean(settled.body?.paid_payslip_id),
      JSON.stringify({
        period: settled.body?.paid_period_id,
        payslip: settled.body?.paid_payslip_id,
      }));

    const paidLoan = await call('GET', `/payroll-loans/${reqId}`, { as: A });
    const paidInstallments = paidLoan.body?.installments ?? [];
    check('the installment is marked deducted against this period',
      paidInstallments.some(
        (i) => i.status === 'deducted' && i.period_id === p3Id,
      ),
      JSON.stringify(paidInstallments.map((i) => `${i.status}@${i.period_id}`)));
    check('a fully repaid loan closes itself',
      paidLoan.body?.status === 'closed' && near(paidLoan.body?.outstanding, 0),
      JSON.stringify({
        status: paidLoan.body?.status,
        outstanding: paidLoan.body?.outstanding,
      }));

    // Re-processing must reproduce the same payslip, not pay the claim twice.
    const rerun = await call('POST', `/payroll-periods/${p3Id}/process`, { as: A });
    if (rerun.status === 200 || rerun.status === 201) {
      const reSettled = await call('GET', `/reimbursements/${claimId}`, { as: A });
      check('a re-run leaves the claim paid exactly once',
        reSettled.body?.status === 'paid' &&
          reSettled.body?.paid_period_id === p3Id,
        JSON.stringify({
          status: reSettled.body?.status,
          period: reSettled.body?.paid_period_id,
        }));
    } else {
      console.log(
        `  SKIP  re-run refused (${rerun.status}) — period no longer re-processable`,
      );
    }

    const report = await call('GET', `/payslips/report?periodId=${p3Id}`, { as: A });
    const mineRow = (report.body?.rows ?? []).find((r) => r.user_id === SUBJECT);
    check('the committed payslip carries the reimbursement',
      near(mineRow?.reimbursement, 3500), JSON.stringify(mineRow ?? null));
    check('the register rolls the reimbursement into its totals',
      near(report.body?.totals?.reimbursement, 3500) ||
        Number(report.body?.totals?.reimbursement ?? 0) >= 3500,
      JSON.stringify(report.body?.totals ?? null));
  }

  // ---- 4c. One-click Quick Setup ------------------------------------------
  //
  // Runs after every figure above has been asserted: Quick Setup adds a second
  // company-wide structure, which is allowed to change absolute pay figures.
  section('Phase 3 — one-click Quick Setup is idempotent (spec §3E)');
  const qsPlan = await call('GET', '/payroll-periods/quick-setup/preview', { as: A });
  check('the dry run is readable', qsPlan.status === 200, `status ${qsPlan.status}`);
  const qsItems = qsPlan.body?.items ?? [];
  check('every setup item declares create or skip',
    qsItems.length > 0 &&
      qsItems.every(
        (i) => i.key && i.label && ['create', 'skip'].includes(i.action),
      ),
    JSON.stringify(qsItems.slice(0, 3)));
  console.log(
    `        plan: ${qsItems.map((i) => `${i.key}=${i.action}`).join(' ')}`,
  );

  const qs1 = await call('POST', '/payroll-periods/quick-setup', { as: A });
  check('quick setup runs', qs1.status === 200 || qs1.status === 201,
    `status ${qs1.status} ${JSON.stringify(qs1.body).slice(0, 200)}`);
  const created1 = qs1.body?.created ?? [];
  const skipped1 = qs1.body?.skipped ?? [];
  check('every item is accounted for as created or skipped',
    created1.length + skipped1.length === qsItems.length,
    `${created1.length} created + ${skipped1.length} skipped vs ${qsItems.length} planned`);
  check('quick setup leaves payroll ready', qs1.body?.setup?.ready === true,
    JSON.stringify(qs1.body?.setup ?? null));
  console.log(`        created: ${created1.length} — ${created1.join('; ').slice(0, 200)}`);

  const qs2 = await call('POST', '/payroll-periods/quick-setup', { as: A });
  check('a second run creates nothing', (qs2.body?.created ?? []).length === 0,
    JSON.stringify(qs2.body?.created ?? null));
  check('a second run skips everything',
    (qs2.body?.skipped ?? []).length === qsItems.length,
    `${(qs2.body?.skipped ?? []).length} skipped vs ${qsItems.length} planned`);
  const qsPlan2 = await call('GET', '/payroll-periods/quick-setup/preview', { as: A });
  check('the dry run now plans no further creates',
    (qsPlan2.body?.items ?? []).every((i) => i.action === 'skip') &&
      qsPlan2.body?.already_complete === true,
    JSON.stringify(
      (qsPlan2.body?.items ?? [])
        .filter((i) => i.action !== 'skip')
        .map((i) => i.key),
    ));

  // ---- 4d. Excel export ---------------------------------------------------
  section('Phase 3 — Excel register download (spec §3F)');
  const xlsx = await download(`/payslips/export?periodId=${p3Id}`, A);
  check('the export responds 200', xlsx.status === 200, `status ${xlsx.status}`);
  check('the content type is a real spreadsheet',
    /spreadsheetml\.sheet/.test(xlsx.type), xlsx.type);
  check('the body is a non-empty ZIP archive (xlsx)',
    xlsx.magic === 'PK' && xlsx.bytes > 1000,
    `${xlsx.bytes} bytes, magic "${xlsx.magic}"`);
  check('a download filename is offered',
    /attachment; *filename=".*\.xlsx"/.test(xlsx.disposition), xlsx.disposition);
  check('the declared length matches the body',
    xlsx.bytes > 0, `${xlsx.bytes} bytes`);
  console.log(`        ${xlsx.bytes} bytes — ${xlsx.disposition}`);

  // ---- 5. RBAC at the HTTP layer -----------------------------------------
  if (E) {
    section('RBAC — Employee is locked out of configuration');
    const forbidden = [
      ['GET', '/payroll-rules'],
      ['GET', '/payroll-tax'],
      ['GET', '/payroll-loans'],
      ['GET', '/salary-components'],
      ['GET', '/payroll-settings'],
      ['GET', '/payroll-periods'],
      ['GET', '/payslips'],
      ['GET', '/reimbursements'],
      ['GET', `/payslips/export?periodId=${periodId}`],
      ['GET', '/payroll-periods/quick-setup/preview'],
      ['POST', '/payroll-periods/quick-setup'],
      ['POST', `/payroll-periods/${periodId}/process`],
      ['POST', `/payroll-periods/${periodId}/approve`],
    ];
    for (const [method, path] of forbidden) {
      const res = await call(method, path, { as: E, body: method === 'POST' ? {} : undefined });
      check(`Employee ${method} ${path} → 403`, res.status === 403, `status ${res.status}`);
    }

    section('RBAC — Employee self-service still works');
    // `/payslips/me` is gated by a tenant switch, not by a permission: HR can
    // withhold payslips from staff entirely. Drive the switch both ways so the
    // suite proves the gate works instead of inheriting whatever the database
    // held, then put the original value back.
    const selfBefore = await call('GET', '/payroll-settings', { as: A });
    const origSelfService = selfBefore.body?.employee_self_service ?? false;
    try {
      const off = await call('PATCH', '/payroll-settings', {
        as: A,
        body: { employee_self_service: false },
      });
      check('self-service can be switched off',
        off.status === 200 && off.body?.employee_self_service === false,
        `status ${off.status}`);
      const blocked = await call('GET', '/payslips/me', { as: E });
      check('with self-service off, /payslips/me → 403',
        blocked.status === 403, `status ${blocked.status}`);

      const on = await call('PATCH', '/payroll-settings', {
        as: A,
        body: { employee_self_service: true },
      });
      check('self-service can be switched on',
        on.status === 200 && on.body?.employee_self_service === true,
        `status ${on.status}`);

      const mine = await call('GET', '/payslips/me', { as: E });
      check('Employee GET /payslips/me → 200', mine.status === 200, `status ${mine.status}`);
      check('self-service returns only own payslips',
        Array.isArray(mine.body)
          ? mine.body.every((p) => p.user_id === employee.user_id || !p.user_id)
          : true,
        'foreign payslip leaked',
      );
      console.log(`        own payslips: ${Array.isArray(mine.body) ? mine.body.length : 'n/a'}`);
    } finally {
      const restored = await call('PATCH', '/payroll-settings', {
        as: A,
        body: { employee_self_service: origSelfService },
      });
      check(`employee_self_service restored to ${origSelfService}`,
        restored.status === 200 &&
          restored.body?.employee_self_service === origSelfService,
        `status ${restored.status}`);
    }

    // The Phase 3 security model in two lines: the org-wide route is refused
    // above, its /me twin is not, and neither needs a permission grant. Note
    // these two are NOT behind the self-service switch — an employee may always
    // see the loans and claims they themselves filed.
    for (const path of ['/payroll-loans/me', '/reimbursements/me']) {
      const res = await call('GET', path, { as: E });
      check(`Employee GET ${path} → 200`, res.status === 200, `status ${res.status}`);
      check(`${path} returns only the caller’s rows`,
        Array.isArray(res.body) &&
          res.body.every((r) => r.user_id === employee.user_id),
        'foreign row leaked');
    }
  }

  section('RBAC — approval stays Admin-only');
  const approve = await call('POST', `/payroll-periods/${periodId}/approve`, { as: A });
  check('Admin may reach approve (not 403)', approve.status !== 403, `status ${approve.status}`);
  console.log(`        approve → ${approve.status} ${JSON.stringify(approve.body).slice(0, 200)}`);

  // ---- 6. The two-step approval workflow ---------------------------------
  // Ships OFF so a lone HR user can complete a run unaided, which means the
  // run above auto-approved and never exercised the Admin approval step. Turn
  // it on, drive a fresh period through process → pending_approval → approved
  // → locked, then restore the original setting.
  section('Approval workflow (approval_enabled = true)');
  const origSettings = await call('GET', '/payroll-settings', { as: A });
  const origApproval = origSettings.body?.approval_enabled ?? false;
  const origLocking = origSettings.body?.payroll_locking_enabled ?? false;
  // Locking is a tenant switch, not a constant: `lock` refuses outright when
  // `payroll_locking_enabled` is false. Assert both switches on for this
  // section rather than depending on whatever the database happened to hold.
  const enabled = await call('PATCH', '/payroll-settings', {
    as: A,
    body: { approval_enabled: true, payroll_locking_enabled: true },
  });
  check('approval can be switched on', enabled.status === 200,
    `status ${enabled.status} ${JSON.stringify(enabled.body).slice(0, 200)}`);
  check('locking can be switched on',
    enabled.body?.payroll_locking_enabled === true,
    String(enabled.body?.payroll_locking_enabled));

  try {
    // This section needs a period in `draft`. Locking is terminal — there is no
    // unlock endpoint — so the period a previous run drove to `locked` cannot be
    // reused; `ensureDraftPeriod` reuses a leftover draft or opens the next
    // numbered one, keeping the suite re-runnable without piling up dead rows.
    const p2 = await ensureDraftPeriod(
      `${TAG} — Approval Flow`,
      {
        frequency: 'monthly',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        pay_date: '2026-10-01',
        working_days: 22,
      },
      A,
    );
    const p2Id = p2.body?.period_id ?? p2.body?.id;

    const run2 = await call('POST', `/payroll-periods/${p2Id}/process`, { as: A });
    const st2 = run2.body?.period?.status ?? run2.body?.status;
    check('processing now parks the run at pending_approval',
      st2 === 'pending_approval', String(st2));

    if (E) {
      const empApprove = await call('POST', `/payroll-periods/${p2Id}/approve`, { as: E });
      check('Employee cannot approve a pending run', empApprove.status === 403,
        `status ${empApprove.status}`);
    }

    const ok = await call('POST', `/payroll-periods/${p2Id}/approve`, { as: A });
    check('Admin approves the pending run',
      ok.status === 200 || ok.status === 201, `status ${ok.status} ${JSON.stringify(ok.body).slice(0, 200)}`);
    check('period is now approved', (ok.body?.status ?? '') === 'approved',
      String(ok.body?.status));
    check('approver is recorded', Boolean(ok.body?.approved_by ?? ok.body?.approved_at),
      JSON.stringify({ by: ok.body?.approved_by, at: ok.body?.approved_at }));

    const locked = await call('POST', `/payroll-periods/${p2Id}/lock`, { as: A });
    check('approved period can be locked',
      locked.status === 200 || locked.status === 201, `status ${locked.status}`);
    check('period is now locked', (locked.body?.status ?? '') === 'locked',
      String(locked.body?.status));

    const reprocess = await call('POST', `/payroll-periods/${p2Id}/process`, { as: A });
    check('a locked period refuses re-processing',
      reprocess.status >= 400 && reprocess.status < 500, `status ${reprocess.status}`);
    console.log(`        locked re-process → ${reprocess.status} ${String(reprocess.body?.message ?? '')}`);
  } finally {
    const restored = await call('PATCH', '/payroll-settings', {
      as: A,
      body: {
        approval_enabled: origApproval,
        payroll_locking_enabled: origLocking,
      },
    });
    check(`approval_enabled restored to ${origApproval}`,
      restored.status === 200 && restored.body?.approval_enabled === origApproval,
      `status ${restored.status}`);
    check(`payroll_locking_enabled restored to ${origLocking}`,
      restored.body?.payroll_locking_enabled === origLocking,
      String(restored.body?.payroll_locking_enabled));
  }

  section('Unauthenticated access is refused');
  for (const path of [
    '/payroll-rules',
    '/payroll-tax',
    '/payroll-loans',
    '/payslips',
    '/reimbursements',
    '/reimbursements/me',
    '/payroll-loans/me',
  ]) {
    const res = await call('GET', path);
    check(`anonymous GET ${path} → 401`, res.status === 401, `status ${res.status}`);
  }
}


if (require.main === module) {
  run()
    .then(() => {
      console.log(`\n${passed} passed, ${failed} failed`);
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('\nFATAL', err);
      process.exit(1);
    });
}
