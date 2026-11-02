// People server simulation: runs twins.sql, twins-fixes.sql and people.sql in PGlite
// (Postgres in WASM) with a stub of Supabase's auth schema, then plays fake phones as the
// `authenticated` role, the way PostgREST does. Dev only; see bottles-sim.mjs for setup:
//
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node supabase/people-sim.mjs

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
alter default privileges in schema public grant all on tables to anon, authenticated;
create table drops (day date primary key, songs jsonb not null);
create table votes (device_id uuid not null, day date not null, position smallint not null, liked boolean not null, primary key (device_id, day, position));
`;

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function freshDb(users = 8) {
  const db = new PGlite();
  await db.exec(STUB);
  for (const f of ['twins.sql', 'twins-fixes.sql', 'people.sql']) await db.exec(readFileSync(join(here, f), 'utf8'));
  const u = Array.from({ length: users }, () => randomUUID());
  for (const id of u) await db.query('insert into auth.users (id) values ($1)', [id]);
  return { db, u };
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
const fails = async (fn) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

async function join_(db, user, { intent = 'either', adult = true, name = 'Sam', handle = 'sam.x', platform = 'discord' } = {}) {
  await as(db, user, 'insert into twin_profiles (device_id, name, handle, platform, adult, intent) values ($1, $2, $3, $4, $5, $6)', [
    randomUUID(), name, handle, platform, adult, intent,
  ]);
  return (await as(db, user, 'select join_people() as r'))[0].r;
}
const heartOnHome = (db, user, tracks) =>
  Promise.all(tracks.map((t) => as(db, user, 'insert into twin_likes (track_id, artist_key) values ($1, $2)', [t, `artist ${t}`])));
const swipe = async (db, user, track, hearted) =>
  (await as(db, user, 'select people_swipe($1, $2, $3) as r', [track, hearted, `artist ${track}`]))[0].r;
const deck = (db, user, lim = 50) => as(db, user, 'select * from people_deck($1)', [lim]);
const people = (db, user) => as(db, user, 'select * from my_people()');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------- joining ----------
{
  const { db, u } = await freshDb();
  check('no profile: empty list, empty deck', (await people(db, u[0])).length === 0 && (await deck(db, u[0])).length === 0);
  check('no profile: a swipe is refused', (await swipe(db, u[0], 5, true)) === false);
  check('under 18 can\'t join', (await join_(db, u[1], { adult: false })) === false);
  check('adult with an intent joins', (await join_(db, u[2])) === true);
  check('people_at can\'t be set by hand', await fails(() => as(db, u[3], "insert into twin_profiles (device_id, name, adult, intent, people_at) values ($1, 'X', true, 'either', now())", [randomUUID()])));
  check('people_at can\'t be updated by hand', await fails(() => as(db, u[2], 'update twin_profiles set people_at = now() where user_id = $1', [u[2]])));
  check('Discord is an allowed platform', (await as(db, u[2], 'select platform from twin_profiles'))[0].platform === 'discord');
  check('a print over 12 rings is refused', await fails(() => as(db, u[2], 'update twin_profiles set print = $1 where user_id = $2', [JSON.stringify(Array(13).fill({})), u[2]])));
}

// ---------- direct access ----------
{
  const { db, u } = await freshDb();
  await join_(db, u[0]);
  await join_(db, u[1], { handle: 'secret', platform: 'instagram' });
  await heartOnHome(db, u[1], [1, 2]);
  await swipe(db, u[0], 1, false);
  check('can\'t read people_swipes', await fails(() => as(db, u[0], 'select * from people_swipes')));
  check('can\'t read people_settings', await fails(() => as(db, u[0], 'select * from people_settings')));
  check('can\'t read people_shown', await fails(() => as(db, u[0], 'select * from people_shown')));
  check('can only read your own likes', (await as(db, u[0], 'select * from twin_likes')).length === 0);
  check('can only read your own profile', (await as(db, u[0], 'select handle from twin_profiles')).every((p) => p.handle !== 'secret'));
  check('anon can\'t call the deck', await fails(() => as(db, u[0], 'select * from people_deck(5)', [], 'anon')));
  check('anon can\'t call my_people', await fails(() => as(db, u[0], 'select * from my_people()', [], 'anon')));
  check('people_member isn\'t callable', await fails(() => as(db, u[0], 'select people_member($1)', [u[1]])));
  check('people_mode isn\'t callable', await fails(() => as(db, u[0], "select people_mode('a', 'b')")));
}

// ---------- the deck ----------
{
  const { db, u } = await freshDb();
  await join_(db, u[0]);
  await join_(db, u[1]);
  await join_(db, u[2]);
  await heartOnHome(db, u[0], [1]);
  await heartOnHome(db, u[1], [1, ...range(10, 39)]);
  await heartOnHome(db, u[2], [10, 100, 101]);
  const d = await deck(db, u[0], 10);
  check('deck never holds a song you hearted', !d.some((r) => Number(r.track_id) === 1));
  check('deck respects the limit, and the per-person cap can make it shorter', d.length >= 1 && d.length <= 10);
  check('deck holds no repeats', new Set(d.map((r) => r.track_id)).size === d.length);
  const from1 = d.filter((r) => Number(r.track_id) >= 10 && Number(r.track_id) <= 39 && Number(r.track_id) !== 10).length;
  check('at most half from one person, when others have songs', from1 <= 6, `got ${from1}`);
  const ten = (await deck(db, u[0], 50)).find((r) => Number(r.track_id) === 10);
  check('hearted_by counts everyone who hearted it', ten?.hearted_by === 2, `got ${ten?.hearted_by}`);
  await swipe(db, u[0], 100, false);
  await swipe(db, u[0], 101, true);
  const after = (await deck(db, u[0], 50)).map((r) => Number(r.track_id));
  check('judged songs leave the deck', !after.includes(100) && !after.includes(101));
  check('a heart in the deck lands in your likes', (await as(db, u[0], 'select track_id from twin_likes where track_id = 101')).length === 1);
  check('a pass does not', (await as(db, u[0], 'select track_id from twin_likes where track_id = 100')).length === 0);
  check('a bad artist key is refused', (await as(db, u[0], "select people_swipe(7, true, '') as r"))[0].r === false);
  check('a bad track is refused', (await as(db, u[0], "select people_swipe(-7, true, 'x') as r"))[0].r === false);
  const huge = await deck(db, u[0], 100000);
  check('a huge limit is capped', huge.length <= 50);
}

// ---------- who can be in whose deck ----------
{
  const { db, u } = await freshDb();
  await join_(db, u[0], { intent: 'friends' });
  await join_(db, u[1], { intent: 'dating' });
  await join_(db, u[2], { intent: 'either' });
  await heartOnHome(db, u[1], [1]);
  await heartOnHome(db, u[2], [2]);
  const d = (await deck(db, u[0])).map((r) => Number(r.track_id));
  check('friends never sees dating-only songs', !d.includes(1));
  check('friends sees either', d.includes(2));
  await as(db, u[3], 'insert into twin_profiles (device_id, name, adult) values ($1, $2, true)', [randomUUID(), 'OldTwin']);
  await heartOnHome(db, u[3], [3]);
  check('an old Twins member who never joined stays out of decks', !(await deck(db, u[2])).some((r) => Number(r.track_id) === 3));
  await as(db, u[2], 'insert into twin_blocks (to_user) values ($1)', [u[0]]);
  await heartOnHome(db, u[0], [4]);
  check('blocking removes your songs from their deck', !(await deck(db, u[2])).some((r) => Number(r.track_id) === 4));
  check('and theirs from yours, both ways', !(await deck(db, u[0])).some((r) => Number(r.track_id) === 2));
}

// ---------- in tune ----------
async function matched(db, a, b, { shared = 4, passes = 11 } = {}) {
  const hearts = range(1, shared);
  const rest = range(100, 99 + passes);
  await heartOnHome(db, b, [...hearts, ...rest]);
  for (const t of hearts) await swipe(db, a, t, true);
  for (const t of rest) await swipe(db, a, t, false);
}
{
  const { db, u } = await freshDb();
  await join_(db, u[0], { intent: 'dating', name: 'Ana' });
  await join_(db, u[1], { intent: 'either', name: 'Bo' });
  await matched(db, u[0], u[1], { shared: 2, passes: 13 });
  check('2 shared hearts is under the floor', (await people(db, u[0])).length === 0);
  await swipe(db, u[0], 100, true);
  let r = (await people(db, u[0]))[0];
  check('3 shared and 15 rated is past it', r?.person === u[1], JSON.stringify(r));
  check('the counts are right', r?.both_rated === 15 && r?.they_hearted_i_rated === 15 && r?.i_hearted_they_rated === 3 && r?.my_cards === 15 && r?.my_hearts === 3, JSON.stringify(r));
  check('shared tracks are listed', r?.shared_tracks?.length === 3);
  check('dating + either reads dating', r?.mode === 'dating');
  check('the bar comes through', Math.abs(r?.min_score - 1.25) < 0.001);
  const back = (await people(db, u[1]))[0];
  check('it\'s symmetric: they see you too', back?.person === u[0] && back?.mode === 'dating' && back?.shared_tracks?.length === 3, JSON.stringify(back));
  // Taking a heart off makes it a pass, and can drop you under the floor.
  await as(db, u[0], 'delete from twin_likes where track_id = 1');
  check('a heart taken off stops counting', (await people(db, u[0])).length === 0);
  await db.exec('update people_settings set min_shared = 2');
  check('settings tune the floor with no new build', (await people(db, u[0])).length === 1);
}

// ---------- waves, handles, songs ----------
{
  const { db, u } = await freshDb();
  await join_(db, u[0], { handle: 'ana.x', platform: 'discord', name: 'Ana' });
  await join_(db, u[1], { handle: 'bo.y', platform: 'instagram', name: 'Bo' });
  await join_(db, u[2], { name: 'Cy' });
  await as(db, u[4], 'insert into twin_profiles (device_id, name, adult, intent) values ($1, $2, true, $3)', [randomUUID(), 'NotIn', 'either']);
  const wave = (from, to) => as(db, from, 'insert into twin_waves (to_user) values ($1)', [to]);
  check('can\'t wave at someone with no overlap', await fails(() => wave(u[0], u[2])));
  check('can\'t wave at someone not in People', await fails(() => wave(u[0], u[4])));
  await matched(db, u[0], u[1]);
  await heartOnHome(db, u[1], [999]);
  const songs = (user, who) => as(db, user, 'select * from person_songs($1)', [who]);
  check('before a wave: only what you share', (await songs(u[0], u[1])).every((s) => s.shared) && (await songs(u[0], u[1])).length === 4);
  const handle = (user, who) => as(db, user, 'select * from twin_handle($1)', [who]);
  check('no handle before anyone waves', (await handle(u[0], u[1])).length === 0);
  await wave(u[0], u[1]);
  check('no handle after one wave', (await handle(u[0], u[1])).length === 0 && (await handle(u[1], u[0])).length === 0);
  const b = (await people(db, u[1])).find((p) => p.person === u[0]);
  check('they see your wave', b?.they_waved === true && b?.i_waved === false);
  await wave(u[1], u[0]);
  check('after both wave, each sees the other\'s handle', (await handle(u[0], u[1]))[0]?.handle === 'bo.y' && (await handle(u[1], u[0]))[0]?.handle === 'ana.x');
  check('after both wave, all their songs', (await songs(u[0], u[1])).some((s) => Number(s.track_id) === 999));
  check('a stranger\'s songs: only shared, so nothing here', (await songs(u[2], u[1])).length === 0);
  await as(db, u[1], 'insert into twin_blocks (to_user) values ($1)', [u[0]]);
  check('a block takes the handle away', (await handle(u[0], u[1])).length === 0);
  check('a block takes the songs away', (await songs(u[0], u[1])).length === 0);
  check('a block takes them off the list', !(await people(db, u[0])).some((p) => p.person === u[1]));
}

// ---------- friends and dating can't wave ----------
{
  const { db, u } = await freshDb();
  await join_(db, u[0], { intent: 'friends' });
  await join_(db, u[1], { intent: 'either' });
  await matched(db, u[0], u[1]);
  check('friends + either reads friends', (await people(db, u[0]))[0]?.mode === 'friends');
  await as(db, u[1], 'update twin_profiles set intent = $1 where user_id = $2', ['dating', u[1]]);
  check('friends + dating is no match', (await people(db, u[0])).length === 0);
  check('and no wave', await fails(() => as(db, u[0], 'insert into twin_waves (to_user) values ($1)', [u[1]])));
}

// ---------- reports ----------
{
  const { db, u } = await freshDb();
  for (let i = 0; i < 5; i++) await join_(db, u[i]);
  const report = (from, to, reason) => as(db, from, 'insert into twin_reports (reported, reason) values ($1, $2)', [to, reason]);
  await heartOnHome(db, u[0], [1]);
  await report(u[1], u[0], 'spam');
  await report(u[2], u[0], 'spam');
  check('two reports leave a profile up', (await deck(db, u[3])).some((r) => Number(r.track_id) === 1));
  await report(u[3], u[0], 'spam');
  check('three reports hide it', !(await deck(db, u[4])).some((r) => Number(r.track_id) === 1));
  await heartOnHome(db, u[1], [2]);
  await report(u[2], u[1], 'under 18');
  check('one "under 18" report hides at once', !(await deck(db, u[4])).some((r) => Number(r.track_id) === 2));
  check('a hidden member sees nothing', (await deck(db, u[1])).length === 0 && (await people(db, u[1])).length === 0);
  await as(db, u[1], 'select leave_twins()');
  await join_(db, u[1]);
  check('leaving and rejoining doesn\'t wash an "under 18" report away', (await as(db, u[1], 'select hidden from twin_profiles'))[0]?.hidden === true);
}

// ---------- Twins retired ----------
{
  const { db, u } = await freshDb();
  await join_(db, u[0]);
  await as(db, u[1], 'insert into twin_profiles (device_id, name, adult) values ($1, $2, false)', [randomUUID(), 'Young']);
  await heartOnHome(db, u[0], [1, 2, 3]);
  await heartOnHome(db, u[1], [1, 2, 3]);
  check('my_twins lists nobody now', (await as(db, u[1], 'select * from my_twins()')).length === 0);
  check('twin_songs needs a mutual wave', (await as(db, u[1], 'select * from twin_songs($1)', [u[0]])).length === 0);
  check('an old under-18 profile has no deck', (await deck(db, u[1])).length === 0);
}

// ---------- logging, leaving, claiming ----------
{
  const { db, u } = await freshDb();
  const device = randomUUID();
  await as(db, u[0], "insert into twin_profiles (device_id, name, adult, intent) values ($1, 'Ana', true, 'either')", [device]);
  await as(db, u[0], 'select join_people()');
  await join_(db, u[1], { name: 'Bo' });
  await matched(db, u[0], u[1]);
  const log = (score) => as(db, u[0], 'select people_log_shown($1, 4, 15, $2) as r', [u[1], score]);
  check('logging works', (await log(1.5))[0].r === true);
  await log(2);
  await log(1e9);
  const shown = (await db.query('select * from people_shown')).rows[0];
  check('first score stays, latest updates, and it\'s clamped', Math.abs(shown.first_score - 1.5) < 0.01 && shown.score === 1000, JSON.stringify(shown));
  check('a stranger can\'t log', (await as(db, u[2], 'select people_log_shown($1, 1, 1, 1) as r', [u[1]]))[0].r === false);
  const p = (await as(db, u[0], 'select * from people_progress()'))[0];
  check('progress counts', p.close === 1 && p.judged === 15 && p.members === 1, JSON.stringify(p));
  // A fresh account on the same phone takes everything back.
  const fresh = u[5];
  check('a new account claims the old one', (await as(db, fresh, 'select claim_twin_profile($1) as r', [device]))[0].r === true);
  check('its swipes come along', (await db.query('select count(*)::int as n from people_swipes where user_id = $1', [fresh])).rows[0].n === 15);
  check('the old id is gone from people_shown', (await db.query('select count(*)::int as n from people_shown where user_id = $1', [u[0]])).rows[0].n === 0);
  check('it still sees the match', (await people(db, fresh)).length === 1);
  await as(db, fresh, 'select leave_twins()');
  const left = async (table, col = 'user_id') => (await db.query(`select count(*)::int as n from ${table} where ${col} = $1`, [fresh])).rows[0].n;
  check('leaving deletes the profile', (await left('twin_profiles')) === 0);
  check('leaving deletes hearts', (await left('twin_likes')) === 0);
  check('leaving deletes swipes', (await left('people_swipes')) === 0);
  check('leaving deletes the log', (await left('people_shown')) === 0);
}

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
