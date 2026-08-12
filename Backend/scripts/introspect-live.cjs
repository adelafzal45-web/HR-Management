// Read-only. Dumps a full picture of the LIVE database schema + current row
// counts to scripts/_schema-report.json, so a destructive wipe+seed can be
// written against ground truth rather than against migration files (some of
// which are untracked / may not be applied).
//
// Loads connection settings the same way the app does: dotenv reads .env, and
// database.config.ts's key names / dev fallbacks are mirrored here.
//
//   node scripts/introspect-live.cjs
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function dbConfig() {
  const s = (name, fallback) => process.env[name] || fallback;
  return {
    host: s('DB_HOST', 'localhost'),
    port: Number(s('DB_PORT', '5432')),
    user: s('DB_USER', 'postgres'),
    password: s('DB_PASSWORD', 'admin'),
    database: s('DB_NAME', 'HR'),
  };
}

(async () => {
  const client = new Client(dbConfig());
  await client.connect();

  // --- base tables + row counts -------------------------------------------
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name`,
  );
  const counts = {};
  for (const { table_name } of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${table_name}"`);
    counts[table_name] = rows[0].n;
  }

  // --- columns for every table --------------------------------------------
  const { rows: cols } = await client.query(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length AS len
       FROM information_schema.columns
      WHERE table_schema='public'
      ORDER BY table_name, ordinal_position`,
  );
  const columns = {};
  for (const c of cols) {
    (columns[c.table_name] ||= []).push({
      name: c.column_name,
      type: c.udt_name,
      len: c.len,
      nullable: c.is_nullable === 'YES',
      default: c.column_default,
    });
  }

  // --- CHECK constraints ---------------------------------------------------
  const { rows: checks } = await client.query(
    `SELECT tc.table_name, cc.check_clause
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON tc.constraint_name = cc.constraint_name
        AND tc.constraint_schema = cc.constraint_schema
      WHERE tc.table_schema='public' AND tc.constraint_type='CHECK'
        AND cc.check_clause NOT LIKE '%IS NOT NULL%'
      ORDER BY tc.table_name`,
  );
  const checkConstraints = {};
  for (const c of checks) (checkConstraints[c.table_name] ||= []).push(c.check_clause);

  // --- enum types ----------------------------------------------------------
  const { rows: enums } = await client.query(
    `SELECT t.typname, e.enumlabel
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname='public'
      ORDER BY t.typname, e.enumsortorder`,
  );
  const enumTypes = {};
  for (const e of enums) (enumTypes[e.typname] ||= []).push(e.enumlabel);

  // --- FK graph ------------------------------------------------------------
  const { rows: fks } = await client.query(
    `SELECT tc.table_name AS child, kcu.column_name AS child_col,
            ccu.table_name AS parent, ccu.column_name AS parent_col,
            rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
       JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
      ORDER BY tc.table_name`,
  );

  // --- unique constraints/indexes -----------------------------------------
  const { rows: uniques } = await client.query(
    `SELECT t.relname AS table_name, i.relname AS index_name,
            array_agg(a.attname ORDER BY k.ord) AS cols, ix.indisunique AS is_unique
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname='public' AND ix.indisunique
      GROUP BY t.relname, i.relname, ix.indisunique
      ORDER BY t.relname`,
  );

  // --- key preserved content ----------------------------------------------
  const { rows: roles } = await client.query(
    `SELECT r.role_id, r.role_name, COUNT(u.user_id)::int AS users
       FROM roles r LEFT JOIN users u ON u.role_id=r.role_id
      GROUP BY r.role_id, r.role_name ORDER BY r.role_name`,
  );
  const { rows: permCount } = await client.query(`SELECT COUNT(*)::int AS n FROM permissions`);
  const { rows: rolePermCount } = await client.query(`SELECT COUNT(*)::int AS n FROM role_permissions`);
  const { rows: leaveTypes } = await client.query(
    `SELECT * FROM leave_types ORDER BY 1`,
  ).catch(() => ({ rows: [] }));
  const { rows: workingDays } = await client.query(
    `SELECT * FROM working_day_schedules ORDER BY 1`,
  ).catch(() => ({ rows: [] }));

  const report = {
    generatedAt: new Date().toISOString(),
    database: dbConfig().database,
    counts,
    columns,
    checkConstraints,
    enumTypes,
    fks,
    uniques,
    roles,
    permCount: permCount[0].n,
    rolePermCount: rolePermCount[0].n,
    leaveTypes,
    workingDays,
  };

  const out = path.join(__dirname, '_schema-report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Wrote ${out}`);
  console.log(`Tables: ${Object.keys(counts).length}`);
  console.log(`Enums: ${Object.keys(enumTypes).length}`);
  console.log(`FKs: ${fks.length}`);
  console.log(`Roles: ${roles.map((r) => `${r.role_name}(${r.users})`).join(', ')}`);
  console.log(`Permissions: ${permCount[0].n}  role_permissions: ${rolePermCount[0].n}`);
  console.log(`leave_types: ${leaveTypes.length}  working_day_schedules: ${workingDays.length}`);

  await client.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
