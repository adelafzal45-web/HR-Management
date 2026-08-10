// Read-only. Reports row counts for every public table plus the candidate
// admin accounts, so a destructive reset can be reviewed before it runs.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

/** Reads connection settings out of data-source.ts so nothing is duplicated. */
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

(async () => {
  const client = new Client(readDataSourceConfig());
  await client.connect();

  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );

  const counts = [];
  for (const { table_name } of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${table_name}"`);
    counts.push([table_name, rows[0].n]);
  }

  const width = Math.max(...counts.map(([t]) => t.length));
  console.log('=== row counts ===');
  for (const [table, n] of counts) {
    console.log(`${table.padEnd(width)}  ${String(n).padStart(6)}${n === 0 ? '' : ''}`);
  }
  console.log(`\ntotal tables: ${counts.length}`);

  console.log('\n=== roles ===');
  const { rows: roles } = await client.query(
    `SELECT r.role_name, COUNT(u.user_id)::int AS users
       FROM roles r LEFT JOIN users u ON u.role_id = r.role_id
       GROUP BY r.role_name ORDER BY r.role_name`,
  );
  for (const r of roles) console.log(`${r.role_name.padEnd(20)} ${r.users} user(s)`);

  console.log('\n=== admin-ish accounts ===');
  const { rows: admins } = await client.query(
    `SELECT u.user_id, u.employee_code, u.first_name, u.last_name, u.email,
            r.role_name, u.status, u.created_at
       FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE r.role_name ILIKE '%admin%' OR r.role_name ILIKE '%hr%'
      ORDER BY u.created_at`,
  );
  for (const a of admins) {
    console.log(
      `${a.role_name.padEnd(16)} ${String(a.employee_code || '-').padEnd(12)} ` +
        `${`${a.first_name} ${a.last_name}`.padEnd(24)} ${a.email}  ` +
        `status=${a.status}  id=${a.user_id}`,
    );
  }
  if (!admins.length) console.log('(none)');

  console.log('\n=== users FK nullability ===');
  const { rows: cols } = await client.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('department_id','designation_id','shift_id',
                            'job_category_id','role_id','team_lead_id')
      ORDER BY column_name`,
  );
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(18)}${c.is_nullable === 'YES' ? 'NULLABLE' : 'NOT NULL'}`);
  }

  console.log('\n=== tables referencing users ===');
  const { rows: fks } = await client.query(
    `SELECT tc.table_name AS child, kcu.column_name AS col, rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
       JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users'
      ORDER BY rc.delete_rule, tc.table_name`,
  );
  for (const f of fks) {
    console.log(`  ${f.child.padEnd(32)}${f.col.padEnd(22)}ON DELETE ${f.delete_rule}`);
  }

  await client.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
