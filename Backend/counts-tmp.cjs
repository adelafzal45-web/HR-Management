const { Client } = require('pg');
(async () => {
  const c = new Client({host:'localhost',port:5432,user:'postgres',password:'admin',database:'HR'});
  await c.connect();
  const t = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  for (const {tablename} of t.rows) {
    const r = await c.query(`SELECT COUNT(*)::int n FROM "${tablename}"`);
    console.log(String(r.rows[0].n).padStart(6), tablename);
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
