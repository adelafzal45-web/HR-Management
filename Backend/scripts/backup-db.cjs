// Full logical backup via pg_dump, taken before any destructive reset.
// Connection settings are read from data-source.ts; the password is passed to
// the child process through the environment so it never lands in a command
// line, a log, or this repo.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function readDataSourceConfig() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data-source.ts'), 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*'([^']*)'`));
    return m ? m[1] : undefined;
  };
  const port = src.match(/port:\s*(\d+)/);
  return {
    host: pick('host'),
    port: port ? port[1] : '5432',
    user: pick('username'),
    password: pick('password'),
    database: pick('database'),
  };
}

// Prefer a real installed binary; fall back to bare `pg_dump` on PATH.
const PG_DUMP_CANDIDATES = [
  'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',
  'C:/Program Files/PostgreSQL/17/bin/pg_dump.exe',
  'C:/Program Files/PostgreSQL/16/bin/pg_dump.exe',
];

const bin = PG_DUMP_CANDIDATES.find((p) => fs.existsSync(p)) || 'pg_dump';

const cfg = readDataSourceConfig();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${cfg.database}-${stamp}.sql`);

const child = spawn(
  bin,
  ['-h', cfg.host, '-p', cfg.port, '-U', cfg.user, '-d', cfg.database, '-f', outFile],
  { env: { ...process.env, PGPASSWORD: cfg.password }, stdio: ['ignore', 'inherit', 'inherit'] },
);

child.on('error', (e) => {
  console.error('FAILED to launch pg_dump:', e.message);
  process.exit(1);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`pg_dump exited with ${code} — backup NOT written.`);
    process.exit(1);
  }
  const bytes = fs.statSync(outFile).size;
  console.log(`Backup written: ${outFile}`);
  console.log(`Size: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
});
