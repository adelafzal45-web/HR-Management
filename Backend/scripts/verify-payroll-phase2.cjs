/**
 * Read-only verification for the Phase 2 payroll RBAC seed (migration
 * 1789200000002) and schema (1789200000003).
 *
 * Checks three things the plan calls out and nothing else — it opens no
 * transaction and issues no writes:
 *   1. every Phase 2 table exists,
 *   2. HR + Admin hold every payroll-rules/-tax/-loans/-reports permission,
 *   3. payroll.approve is still Administrator-only, and no Employee or Team
 *      Lead role holds any payroll configuration permission.
 *
 * Connection settings come from the environment, same as the app.
 */
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'HR',
};

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

const PHASE2_TABLES = [
  'payroll_rules',
  'tax_configs',
  'tax_slabs',
  'employee_loans',
  'loan_installments',
];

const PHASE1_TABLES = [
  'payroll_settings',
  'salary_components',
  'salary_structures',
  'salary_structure_components',
  'salary_structure_assignments',
  'employee_component_overrides',
  'payroll_periods',
  'payslips',
  'payslip_lines',
];

const CONFIG_PERMS = [
  'payroll-rules.view',
  'payroll-rules.create',
  'payroll-rules.update',
  'payroll-rules.delete',
  'payroll-tax.view',
  'payroll-tax.create',
  'payroll-tax.update',
  'payroll-tax.delete',
  'payroll-loans.view',
  'payroll-loans.create',
  'payroll-loans.update',
  'payroll-loans.delete',
  'payroll-reports.view',
];

// The DB spells roles differently from the frontend slugs, so match on any alias.
const HR_ALIASES = ['hr admin', 'hr', 'hr manager', 'human resources'];
const ADMIN_ALIASES = ['admin', 'administrator', 'super admin'];
const STAFF_ALIASES = ['employee', 'team lead', 'teamlead', 'team-lead', 'staff'];

(async () => {
  const client = new Client(CONFIG);
  await client.connect();
  console.log(`\nConnected to ${CONFIG.database}@${CONFIG.host}:${CONFIG.port}\n`);

  // ---------------------------------------------------------------- schema
  console.log('== SCHEMA ==');
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const names = new Set(tables.map((t) => t.table_name));
  for (const t of [...PHASE1_TABLES, ...PHASE2_TABLES]) {
    ok(`table ${t} exists`, names.has(t));
  }
  ok('legacy payroll table left intact', names.has('payroll'));

  // Versioning columns the §16 rule-history UI reads.
  const { rows: ruleCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payroll_rules'`,
  );
  const rc = new Set(ruleCols.map((c) => c.column_name));
  for (const c of [
    'rule_type',
    'scope_type',
    'scope_id',
    'config',
    'priority',
    'effective_from',
    'effective_to',
    'version',
    'superseded_by',
  ]) {
    ok(`payroll_rules.${c} present`, rc.has(c));
  }

  // ---------------------------------------------------------- migrations ran
  console.log('\n== MIGRATIONS ==');
  const { rows: migrations } = await client.query(
    `SELECT name FROM migrations WHERE name LIKE '%Payroll%' ORDER BY timestamp`,
  );
  const ran = migrations.map((m) => m.name);
  for (const m of [
    'CreatePayrollEngineSchema1789200000000',
    'SeedPayrollModulePermissions1789200000001',
    'SeedPayrollPhase2Permissions1789200000002',
    'CreatePayrollPhase2Schema1789200000003',
  ]) {
    ok(`migration ${m} recorded`, ran.some((r) => r.includes(m.replace(/\d+$/, ''))), `-> saw ${JSON.stringify(ran)}`);
  }

  // -------------------------------------------------------------- permissions
  console.log('\n== PERMISSIONS EXIST ==');
  const { rows: permRows } = await client.query(
    `SELECT permission_name FROM permissions WHERE permission_name = ANY($1)`,
    [CONFIG_PERMS.concat(['payroll.approve', 'payroll.process', 'payroll.preview', 'payroll.lock'])],
  );
  const perms = new Set(permRows.map((p) => p.permission_name));
  for (const p of CONFIG_PERMS) ok(`permission ${p} seeded`, perms.has(p));
  ok('permission payroll.approve seeded', perms.has('payroll.approve'));

  // --------------------------------------------------------------- grants
  console.log('\n== GRANTS ==');
  const { rows: grants } = await client.query(
    `SELECT r.role_name, p.permission_name AS permission
       FROM role_permissions rp
       JOIN roles r ON r.role_id = rp.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE p.permission_name LIKE 'payroll%'`,
  );

  const byRole = new Map();
  for (const g of grants) {
    const key = g.role_name.toLowerCase();
    if (!byRole.has(key)) byRole.set(key, new Set());
    byRole.get(key).add(g.permission);
  }
  console.log(
    `  roles holding payroll permissions: ${[...byRole.keys()].map((r) => `${r}(${byRole.get(r).size})`).join(', ') || 'none'}`,
  );

  const hrRoles = [...byRole.keys()].filter((r) => HR_ALIASES.includes(r));
  const adminRoles = [...byRole.keys()].filter((r) => ADMIN_ALIASES.includes(r));
  ok('an HR role exists with payroll grants', hrRoles.length > 0, `-> ${JSON.stringify([...byRole.keys()])}`);
  ok('an Admin role exists with payroll grants', adminRoles.length > 0);

  for (const role of [...hrRoles, ...adminRoles]) {
    const held = byRole.get(role);
    const missing = CONFIG_PERMS.filter((p) => !held.has(p));
    ok(`${role} holds all 13 Phase 2 config permissions`, missing.length === 0, `-> missing ${JSON.stringify(missing)}`);
  }

  // approve stays Admin-only
  const approvers = grants.filter((g) => g.permission === 'payroll.approve').map((g) => g.role_name);
  ok(
    `payroll.approve granted only to Admin (holders: ${JSON.stringify(approvers)})`,
    approvers.length > 0 && approvers.every((r) => ADMIN_ALIASES.includes(r.toLowerCase())),
  );

  // staff roles hold nothing payroll-ish
  const staffWithPayroll = [...byRole.keys()].filter((r) => STAFF_ALIASES.includes(r));
  ok(
    `no Employee/Team Lead role holds a payroll permission (found: ${JSON.stringify(staffWithPayroll)})`,
    staffWithPayroll.length === 0,
  );

  await client.end();

  console.log(`\n== RESULT ==\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nprobe crashed:', err.message);
  process.exit(1);
});
