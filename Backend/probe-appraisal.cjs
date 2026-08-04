/* Temporary live-probe harness for the dynamic appraisal work. Deleted after the run. */
const BASE = 'http://localhost:3000/api';
const PASS = 'Password@123';

let pass = 0;
let fail = 0;

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  });
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`login ${email} -> ${r.status} ${await r.text()}`);
  }
  const body = await r.json();
  return body.access_token ?? body.accessToken ?? body.token;
}

function api(token) {
  return async (method, path, body) => {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON (xlsx) */ }
    return { status: r.status, json, text, headers: r.headers };
  };
}

module.exports = { BASE, PASS, ok, login, api, report: () => ({ pass, fail }) };
