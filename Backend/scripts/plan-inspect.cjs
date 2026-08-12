// Read-only. Final recon before the wipe+seed: full column lists for the
// master-data tables the SQL seed inserts into, Admin distinct-permission
// coverage, role_permissions shape, leave types, and currency.
//   node scripts/plan-inspect.cjs
require('dotenv').config();
const { Client } = require('pg');

function dbConfig() {
  const s = (n, f) => process.env[n] || f;
  return {
    host: s('DB_HOST', 'localhost'), port: Number(s('DB_PORT', '5432')),
    user: s('DB_USER', 'postgres'), password: s('DB_PASSWORD', 'admin'),
    database: s('DB_NAME', 'HR'),
  };
}

const TABLES = [
  'shifts', 'attendance', 'leave_requests', 'leave_entitlements',
  'leave_history', 'user_leave_balances', 'notifications',
  'team_lead_assignments', 'team_lead_assignment_members',
  'departments', 'designations', 'job_categories',
];

(async () => {
  const c = new Client(dbConfig());
  await c.connect();

  for (const t of TABLES) {
    const { rows } = await c.query(
      `SELECT column_name, udt_name, character_maximum_length AS len,
              is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position`, [t]);
    console.log(`\n=== ${t} ===`);
    for (const r of rows) {
      const nn = r.is_nullable === 'NO' ? 'NOT NULL' : 'null';
      const def = r.column_default ? ` default=${r.column_default}` : '';
      console.log(`  ${r.column_name.padEnd(30)} ${(r.udt_name + (r.len ? '(' + r.len + ')' : '')).padEnd(16)} ${nn}${def}`);
    }
  }

  // Admin distinct permission coverage
  const adminId = '53cd533c-13a9-400f-93f5-2fb207239874';
  const { rows: cov } = await c.query(
    `SELECT
        (SELECT COUNT(*)::int FROM permissions) AS total_perms,
        (SELECT COUNT(DISTINCT permission_id)::int FROM role_permissions WHERE role_id=$1) AS admin_distinct,
        (SELECT COUNT(*)::int FROM role_permissions WHERE role_id=$1) AS admin_rows,
        (SELECT COUNT(*)::int FROM permissions p
           WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp
                              WHERE rp.role_id=$1 AND rp.permission_id=p.permission_id)) AS admin_missing`,
    [adminId]);
  console.log('\n=== Admin permission coverage ===');
  console.log(`  total permissions:      ${cov[0].total_perms}`);
  console.log(`  admin distinct perms:   ${cov[0].admin_distinct}`);
  console.log(`  admin role_perm rows:   ${cov[0].admin_rows}  (>${cov[0].admin_distinct} means duplicates)`);
  console.log(`  admin MISSING perms:    ${cov[0].admin_missing}`);

  // role_permissions shape
  const { rows: rpCols } = await c.query(
    `SELECT column_name, udt_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='role_permissions' ORDER BY ordinal_position`);
  console.log('\n=== role_permissions columns ===');
  for (const r of rpCols)
    console.log(`  ${r.column_name.padEnd(20)} ${r.udt_name.padEnd(12)} ${r.is_nullable === 'NO' ? 'NOT NULL' : 'null'}${r.column_default ? ' default=' + r.column_default : ''}`);
  const { rows: rpUq } = await c.query(
    `SELECT i.relname AS idx, array_agg(a.attname ORDER BY k.ord) AS cols, ix.indisunique AS uq, ix.indisprimary AS pk
       FROM pg_index ix JOIN pg_class i ON i.oid=ix.indexrelid
       JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
       JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
      WHERE n.nspname='public' AND t.relname='role_permissions'
      GROUP BY i.relname, ix.indisunique, ix.indisprimary`);
  for (const u of rpUq)
    console.log(`  index ${u.idx}: [${u.cols.join(', ')}] ${u.pk ? 'PK' : u.uq ? 'UNIQUE' : ''}`);

  // leave types + currency
  const { rows: lt } = await c.query(
    `SELECT leave_type_id, name, is_paid, max_days_per_year, is_active FROM leave_types ORDER BY name`);
  console.log('\n=== leave_types ===');
  for (const l of lt)
    console.log(`  ${l.name.padEnd(24)} paid=${l.is_paid} max=${l.max_days_per_year} active=${l.is_active} id=${l.leave_type_id}`);

  const { rows: cs } = await c.query(`SELECT currency, company_name, timezone FROM company_settings LIMIT 1`);
  console.log('\n=== company_settings ===');
  console.log(`  currency=${cs[0]?.currency}  company=${cs[0]?.company_name}  tz=${cs[0]?.timezone}`);

  console.log('\n=== env for API phase ===');
  console.log(`  JWT_SECRET set: ${process.env.JWT_SECRET ? 'yes' : 'no (will use dev default)'}`);
  console.log(`  PORT: ${process.env.PORT ?? '(default 3000)'}`);

  await c.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
