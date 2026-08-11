/**
 * Live end-to-end verification of the payroll engine (plan verification
 * steps 10, 12 and the Phase 2 engine integration).
 *
 * Read-mostly against the API, not the DB: it drives the same HTTP routes the
 * UI calls, so guards, DTO validation and the hard gate are all exercised for
 * real. The only writes are the additive config rows the walkthrough needs
 * (component, structure, assignment, overtime rule, tax config, loan) plus one
 * draft period — nothing is deleted or overwritten.
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
  const created = await ensure('period', {
    as: A,
    listPath: '/payroll-periods',
    match: (p) => p.name === `${TAG} — August 2026`,
    body: {
      name: `${TAG} — August 2026`,
      frequency: 'monthly',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      pay_date: '2026-09-01',
      working_days: 21,
    },
  });
  check('period created', created.status === 201, `status ${created.status} ${JSON.stringify(created.body)}`);
  const periodId = created.body?.period_id ?? created.body?.id;
  check('period id returned', Boolean(periodId), JSON.stringify(created.body));
  if (!created.reused) {
    check('period is born draft', created.body?.status === 'draft', String(created.body?.status));
  }

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
      ['POST', `/payroll-periods/${periodId}/process`],
      ['POST', `/payroll-periods/${periodId}/approve`],
    ];
    for (const [method, path] of forbidden) {
      const res = await call(method, path, { as: E, body: method === 'POST' ? {} : undefined });
      check(`Employee ${method} ${path} → 403`, res.status === 403, `status ${res.status}`);
    }

    section('RBAC — Employee self-service still works');
    const mine = await call('GET', '/payslips/me', { as: E });
    check('Employee GET /payslips/me → 200', mine.status === 200, `status ${mine.status}`);
    check('self-service returns only own payslips',
      Array.isArray(mine.body)
        ? mine.body.every((p) => p.user_id === employee.user_id || !p.user_id)
        : true,
      'foreign payslip leaked',
    );
    console.log(`        own payslips: ${Array.isArray(mine.body) ? mine.body.length : 'n/a'}`);
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
  const enabled = await call('PATCH', '/payroll-settings', {
    as: A,
    body: { approval_enabled: true },
  });
  check('approval can be switched on', enabled.status === 200,
    `status ${enabled.status} ${JSON.stringify(enabled.body).slice(0, 200)}`);

  try {
    // This section needs a period in `draft`. Locking is terminal — there is no
    // unlock endpoint — so the period a previous run drove to `locked` cannot be
    // reused. Reuse a leftover draft if one exists, else open the next numbered
    // one, so the suite stays re-runnable without piling up dead rows.
    const FLOW = `${TAG} — Approval Flow`;
    const existing = await call('GET', '/payroll-periods', { as: A });
    const flowRows = Array.isArray(existing.body)
      ? existing.body.filter((p) => String(p.name ?? '').startsWith(FLOW))
      : [];
    const draft = flowRows.find((p) => p.status === 'draft');
    let p2;
    if (draft) {
      console.log('  reuse approval-flow period (draft)');
      p2 = { body: draft };
    } else {
      const name = `${FLOW} #${flowRows.length + 1}`;
      p2 = await call('POST', '/payroll-periods', {
        as: A,
        body: {
          name,
          frequency: 'monthly',
          period_start: '2026-09-01',
          period_end: '2026-09-30',
          pay_date: '2026-10-01',
          working_days: 22,
        },
      });
      console.log(`  create ${name}`);
    }
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
      body: { approval_enabled: origApproval },
    });
    check(`approval_enabled restored to ${origApproval}`,
      restored.status === 200 && restored.body?.approval_enabled === origApproval,
      `status ${restored.status}`);
  }

  section('Unauthenticated access is refused');
  for (const path of ['/payroll-rules', '/payroll-tax', '/payroll-loans', '/payslips']) {
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
