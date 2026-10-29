// Bottles server simulation: runs supabase/bottles.sql in PGlite (Postgres in WASM) with a
// stub of Supabase's auth schema, then plays fake phones against the four RPCs, each call
// made as the `authenticated` role, the way PostgREST makes it. Dev only. PGlite is not a
// project dependency; install it anywhere outside the repo and point PGLITE at it:
//
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node supabase/bottles-sim.mjs
//
// PGlite is one connection, so "two phones claim at once" runs back to back here; on real
// Postgres `for update skip locked` is what keeps them apart.

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
`;

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function freshDb(users = 12) {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(readFileSync(join(here, 'ai-reports.sql'), 'utf8'));
  await db.exec(readFileSync(join(here, 'bottles.sql'), 'utf8'));
  const ids = Array.from({ length: users }, () => randomUUID());
  for (const id of ids) await db.query('insert into auth.users (id) values ($1)', [id]);
  return { db, u: ids };
}

/** One RPC as a signed-in phone. Returns the function's json result. */
async function rpc(db, user, fn, args) {
  const names = Object.keys(args);
  const sql = `select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.exec('set role authenticated');
  try {
    const res = await db.query(sql, names.map((n) => args[n]));
    return res.rows[0].r;
  } finally {
    await db.exec('reset role');
  }
}

const DALLAS = JSON.stringify({ city: 'Dallas', country: 'United States', lat: 32.78, lng: -96.8, exact: true });
const placeOf = (city, lat = 10, lng = 10) => JSON.stringify({ city, country: 'X', lat, lng, exact: true });

const float = (db, user, trackId, extra = {}) =>
  rpc(db, user, 'float_bottle', {
    p_track_id: trackId,
    p_artist_key: extra.artist ?? `artist ${trackId}`,
    p_genre_tag: extra.genre ?? 'shoegaze',
    p_place: extra.place ?? DALLAS,
    p_old: extra.old ?? false,
  });
const claim = (db, user, genre = 'shoegaze') => rpc(db, user, 'claim_bottle', { p_genre_tag: genre });
const decide = (db, user, id, verdict, extra = {}) =>
  rpc(db, user, 'decide_bottle', {
    p_id: id,
    p_verdict: verdict,
    p_place: extra.place ?? DALLAS,
    p_tier: extra.tier ?? null,
    p_ring: extra.ring ?? null,
  });
const mine = (db, user, since = null) => rpc(db, user, 'my_bottles', { p_since: since });
const asJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

// ---------- launching ----------
{
  const { db, u } = await freshDb();
  const first = asJson(await float(db, u[0], 1001));
  check('float returns an id', typeof first?.id === 'string');
  check('same song twice is a duplicate', asJson(await float(db, u[0], 1001))?.error === 'duplicate');
  for (let t = 1002; t <= 1020; t++) await float(db, u[0], t);
  check('the 21st launch in a day hits the cap', asJson(await float(db, u[0], 1021))?.error === 'cap');
  let oldOk = 0;
  for (let t = 2001; t <= 2030; t++) if (asJson(await float(db, u[0], t, { old: true }))?.id) oldOk++;
  check('30 old finds float despite the daily cap', oldOk === 30, `got ${oldOk}`);
  check('the 31st old find hits its cap', asJson(await float(db, u[0], 2031, { old: true }))?.error === 'cap');
  const hop = (await db.query(`select lat, lng, city from bottle_hops where kind = 'launch' order by id limit 1`)).rows[0];
  check('the server rounds coordinates to 0.5°', hop.lat === 33 && hop.lng === -97, JSON.stringify(hop));
  let anonFailed = false;
  try {
    await float(db, null, 3001);
  } catch {
    anonFailed = true;
  }
  check('a call with no signed-in user fails', anonFailed);
  check('your own bottles never wash up for you', (await claim(db, u[0])) === null);
}

// ---------- claiming ----------
{
  const { db, u } = await freshDb();
  for (let t = 1; t <= 40; t++) await float(db, t <= 20 ? u[0] : u[3], t); // 20 each: the daily cap
  const a = asJson(await claim(db, u[1]));
  const b = asJson(await claim(db, u[2]));
  check('a claim returns a bottle with its chain', a?.id && Array.isArray(a.hops) && a.hops[0]?.kind === 'launch');
  check('a held bottle is not lent to anyone else', a.id !== b.id);
  const seen = new Set([a.id]);
  await decide(db, u[1], a.id, 'pass');
  let repeat = false;
  for (let i = 0; i < 39; i++) {
    const c = asJson(await claim(db, u[1]));
    if (!c) break;
    if (seen.has(c.id)) repeat = true;
    seen.add(c.id);
    await decide(db, u[1], c.id, 'pass');
  }
  check('no phone ever gets the same bottle twice', !repeat && seen.size === 39, `saw ${seen.size}`);
  check('once everything is offered, a claim comes back empty', (await claim(db, u[1])) === null);
  let readBlocked = 0;
  for (const table of ['bottles', 'bottle_hops', 'bottle_offers']) {
    await db.exec('set role authenticated');
    try {
      await db.query(`select * from ${table} limit 1`);
    } catch {
      readBlocked++;
    } finally {
      await db.exec('reset role');
    }
  }
  check('phones cannot read the tables directly', readBlocked === 3);
  let jsonBlocked = false;
  await db.exec('set role authenticated');
  try {
    await db.query(`select bottle_json($1)`, [a.id]);
  } catch {
    jsonBlocked = true;
  } finally {
    await db.exec('reset role');
  }
  check('phones cannot read a journey by id', jsonBlocked);
}

// ---------- keep, pass, sink ----------
{
  const { db, u } = await freshDb();
  const id = asJson(await float(db, u[0], 77)).id;
  const takeAndDecide = async (user, verdict, extra) => {
    const c = asJson(await claim(db, user));
    if (c?.id !== id) throw new Error('expected the one bottle');
    return asJson(await decide(db, user, id, verdict, extra));
  };
  await takeAndDecide(u[1], 'pass');
  await takeAndDecide(u[2], 'pass');
  const kept = await takeAndDecide(u[3], 'keep', { place: placeOf('Lisbon', 38.72, -9.14), tier: 'deep', ring: { key: 4, mode: 0, energy: 0.6, tempo: 120 } });
  check('keep answers with the new count', kept.ok === true && kept.keeps === 1 && kept.state === 'floating');
  for (const user of [u[4], u[5], u[6], u[7]]) await takeAndDecide(user, 'pass');
  const state1 = (await db.query('select state, passes_in_row from bottles where id = $1', [id])).rows[0];
  check('a keep resets the run of passes', state1.state === 'floating' && state1.passes_in_row === 4, JSON.stringify(state1));
  const fifth = await takeAndDecide(u[8], 'pass');
  check('5 passes in a row sink it', fifth.state === 'sunk');
  check('a sunk bottle never washes up', (await claim(db, u[9])) === null);
  const chain = asJson(await mine(db, u[3]));
  const hops = chain[0]?.hops ?? [];
  check('the chain is launch then keep, in order', hops.length === 2 && hops[0].kind === 'launch' && hops[1].kind === 'keep');
  check('a keep hop carries city, tier and ring', hops[1]?.city === 'Lisbon' && hops[1]?.tier === 'deep' && hops[1]?.ring?.key === 4);
  check('the keeper sees the bottle in my_bottles', chain.length === 1 && chain[0].state === 'sunk');
  check('a passer does not', asJson(await mine(db, u[1])).length === 0);
  check('the finder does', asJson(await mine(db, u[0])).length === 1);
  check('since filters out older changes', asJson(await mine(db, u[0], new Date(Date.now() + 60_000).toISOString())).length === 0);
}

// ---------- the same person twice, unplayable, known ----------
{
  const { db, u } = await freshDb();
  const id = asJson(await float(db, u[0], 88)).id;
  await claim(db, u[1]);
  await decide(db, u[1], id, 'keep');
  check('a keeper never gets the bottle again', (await claim(db, u[1])) === null);
  const before = (await db.query('select keeps, passes, passes_in_row, unplayable from bottles where id = $1', [id])).rows[0];
  await claim(db, u[2]);
  await decide(db, u[2], id, 'known');
  const after = (await db.query('select keeps, passes, passes_in_row, unplayable, holder from bottles where id = $1', [id])).rows[0];
  check('known changes no counters and frees the bottle', JSON.stringify({ ...before, holder: null }) === JSON.stringify(after));
  for (const user of [u[3], u[4], u[5]]) {
    await claim(db, user);
    await decide(db, user, id, 'unplayable');
  }
  check('3 unplayable reports retire it', (await db.query('select state from bottles where id = $1', [id])).rows[0].state === 'retired');
  const bad = asJson(await decide(db, u[6], id, 'keep'));
  check('a verdict without an offer is refused', bad.ok === false);
}

// ---------- leases and late verdicts ----------
{
  const { db, u } = await freshDb();
  const id = asJson(await float(db, u[0], 99)).id;
  await claim(db, u[1]);
  check('a live lease keeps others out', (await claim(db, u[2])) === null);
  await db.query(`update bottles set lease_until = now() - interval '1 minute' where id = $1`, [id]);
  check('an expired lease can be claimed', asJson(await claim(db, u[2]))?.id === id);
  check('a late verdict after someone else claimed it is dropped', asJson(await decide(db, u[1], id, 'keep')).ok === false);
  check('…and the dropped keep added no hop', (await db.query('select count(*)::int as n from bottle_hops where bottle_id = $1', [id])).rows[0].n === 1);
  check('the new holder can still decide', asJson(await decide(db, u[2], id, 'pass')).ok === true);
  const id2 = asJson(await float(db, u[0], 100, { genre: 'late' })).id;
  check('the late-verdict bottle is the one lent', asJson(await claim(db, u[3], 'late'))?.id === id2);
  await db.query(`update bottles set lease_until = now() - interval '1 minute' where id = $1`, [id2]);
  check('a late verdict nobody overtook still counts', asJson(await decide(db, u[3], id2, 'keep')).ok === true);
  const [x, y] = await Promise.all([claim(db, u[4]), claim(db, u[5])]);
  const got = [asJson(x), asJson(y)].filter(Boolean);
  check('two claims at once never share a bottle', got.length <= 2 && new Set(got.map((g) => g.id)).size === got.length);
}

// ---------- which bottle washes up ----------
{
  const { db, u } = await freshDb(40);
  await float(db, u[0], 1, { genre: 'metal' });
  const jazz = asJson(await float(db, u[0], 2, { genre: 'jazz' })).id;
  check('your genre comes first', asJson(await claim(db, u[1], 'jazz'))?.id === jazz);
  check('then any genre', asJson(await claim(db, u[2], 'jazz'))?.genre_tag === 'metal');

  for (let t = 10; t < 20; t++) await float(db, u[0], t, { genre: 'folk' });
  await db.query(`update bottles set last_moved_at = now() - make_interval(hours => track_id::int) where genre_tag = 'folk'`);
  let fresh = 0;
  let oldest = 0;
  for (let i = 0; i < 20; i++) {
    const c = asJson(await claim(db, u[10 + i], 'folk'));
    if (c?.track_id === 10) fresh++;
    if (c?.track_id === 19) oldest++;
    await db.query(`update bottles set holder = null, lease_until = null`);
    await db.query(`delete from bottle_offers`);
  }
  check('fresh and longest-waiting bottles take turns', fresh >= 5 && oldest >= 5 && fresh + oldest === 20, `fresh ${fresh}, oldest ${oldest}`);

  for (const user of [u[30], u[31], u[32]]) await db.query(`insert into ai_reports (artist_key, device_id) values ('slopbot', $1)`, [user]);
  await db.query(`delete from bottles`);
  await float(db, u[0], 500, { artist: 'slopbot' });
  check('artists 3 phones reported as AI never wash up', (await claim(db, u[33])) === null);
}

if (failures.length) {
  console.error(`bottles sim: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`bottles sim: all ${passed} checks passed`);
