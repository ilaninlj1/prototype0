// Crowd reports simulation: runs comments.sql and ai-reports.sql in PGlite (Postgres in WASM)
// with a stub of Supabase's auth schema, first as they are live, then with
// crowd-reports.sql on top, and plays callers as the `anon` and `authenticated` roles the
// way PostgREST does. Dev only (threat-model.md TM-002, docs/threat-map.md area D):
//
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node supabase/crowd-sim.mjs

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
if (!process.env.PGLITE) {
  console.error('Set PGLITE to the path of @electric-sql/pglite/dist/index.js (see the header).');
  process.exit(2);
}
const { PGlite } = await import(process.env.PGLITE);

// Same stub as people-sim.mjs. Supabase grants table rights to anon and authenticated by
// default, so row-level security is the only thing deciding who may insert.
const STUB = `
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon;
create role authenticated;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`;

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function freshDb({ fixed }) {
  const db = new PGlite();
  await db.exec(STUB);
  for (const f of ['comments.sql', 'ai-reports.sql', ...(fixed ? ['crowd-reports.sql'] : [])]) {
    await db.exec(readFileSync(join(here, f), 'utf8'));
  }
  const u = Array.from({ length: 4 }, () => randomUUID());
  for (const id of u) await db.query('insert into auth.users (id) values ($1)', [id]);
  const c = await db.query(`insert into comments (track_id, device_id, body) values (1, $1, 'hi') returning id`, [randomUUID()]);
  return { db, u, commentId: c.rows[0].id };
}

async function as(db, user, sql, params = [], role = 'authenticated') {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.exec(`set role ${role}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
const anon = (db, sql, params) => as(db, null, sql, params, 'anon');
const ok = async (fn) => {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
};

const reportAi = (db, user, device, role = 'authenticated') =>
  ok(() => as(db, user, `insert into ai_reports (artist_key, device_id) values ('some band', $1)`, [device], role));
const reportComment = (db, user, commentId, device, role = 'authenticated') =>
  ok(() => as(db, user, 'insert into comment_reports (comment_id, device_id) values ($1, $2)', [commentId, device], role));
const aiHidden = async (db) => (await anon(db, 'select artist_key from ai_reported')).some((r) => r.artist_key === 'some band');
const commentHidden = async (db, id) => (await db.query('select hidden from comments where id = $1', [id])).rows[0].hidden;

// ---------- today's live rules: the hole is real ----------
{
  const { db, commentId } = await freshDb({ fixed: false });
  for (let i = 0; i < 3; i++) await reportAi(db, null, randomUUID(), 'anon');
  check('live rules: three made-up device ids hide an artist for everyone', await aiHidden(db));
  for (let i = 0; i < 3; i++) await reportComment(db, null, commentId, randomUUID(), 'anon');
  check('live rules: three made-up device ids hide a comment', await commentHidden(db, commentId));
}

// ---------- AI reports with the fix ----------
{
  const { db, u } = await freshDb({ fixed: true });
  check('fixed: the public key alone can no longer report an artist', !(await reportAi(db, null, randomUUID(), 'anon')));
  check('fixed: an account can report as itself', await reportAi(db, u[0], u[0]));
  check('fixed: an account cannot report under a made-up id', !(await reportAi(db, u[0], randomUUID())));
  check('fixed: an account cannot report under another account', !(await reportAi(db, u[0], u[1])));
  check('fixed: the same account twice is refused (counts once)', !(await reportAi(db, u[0], u[0])));
  await reportAi(db, u[1], u[1]);
  check('fixed: two accounts are not enough', !(await aiHidden(db)));
  await reportAi(db, u[2], u[2]);
  check('fixed: three different accounts hide the artist', await aiHidden(db));
  check('fixed: the public key can still read the verdict list', await ok(() => anon(db, 'select * from ai_reported')));
  // No select rule means an empty answer, not an error (the live check saw `[]` too).
  check('fixed: the public key still cannot read who reported', (await anon(db, 'select * from ai_reports')).length === 0);
}

// ---------- reports sent before the fix still count ----------
{
  const { db, u } = await freshDb({ fixed: true });
  await db.query(`insert into ai_reports (artist_key, device_id) values ('some band', $1), ('some band', $2)`, [randomUUID(), randomUUID()]);
  await reportAi(db, u[0], u[0]);
  check('fixed: two old reports plus one account still hide the artist', await aiHidden(db));
}

// ---------- comment reports with the fix ----------
{
  const { db, u, commentId } = await freshDb({ fixed: true });
  check('fixed: the public key alone can no longer report a comment', !(await reportComment(db, null, commentId, randomUUID(), 'anon')));
  check('fixed: an account cannot report a comment under a made-up id', !(await reportComment(db, u[0], commentId, randomUUID())));
  for (const user of u.slice(0, 2)) await reportComment(db, user, commentId, user);
  check('fixed: two accounts do not hide a comment', !(await commentHidden(db, commentId)));
  await reportComment(db, u[2], commentId, u[2]);
  check('fixed: three accounts hide the comment', await commentHidden(db, commentId));
}

// ---------- what the fix leaves alone ----------
{
  const { db } = await freshDb({ fixed: true });
  check('fixed: comments can still be posted with the public key',
    await ok(() => anon(db, `insert into comments (track_id, device_id, body) values (2, $1, 'still works')`, [randomUUID()])));
  check('fixed: vibes can still be added with the public key',
    await ok(() => anon(db, `insert into vibes (track_id, device_id, word) values (2, $1, 'warm')`, [randomUUID()])));
  check('fixed: running the fix twice is safe', await ok(() => db.exec(readFileSync(join(here, 'crowd-reports.sql'), 'utf8'))));
}

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
