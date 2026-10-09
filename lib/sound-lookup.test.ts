import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSoundLookup } from './sound-lookup.ts';

const recco = { isrc: 'ISRC1', acousticness: 0.1, danceability: 0.5, energy: 0.5, instrumentalness: 0, key: 2, liveness: 0.1, loudness: -6, mode: 0, speechiness: 0.05, tempo: 101, valence: 0.4 };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function harness(routes: (url: string) => Response) {
  const calls: string[] = [];
  let stored: Record<number, unknown> = {};
  const lookup = createSoundLookup({
    fetch: (async (u: string | URL) => { calls.push(String(u)); return routes(String(u)); }) as typeof fetch,
    read: async () => stored as never,
    write: async (all) => { stored = all; },
    now: () => 1_000,
  });
  return { lookup, calls, stored: () => stored };
}

const song = { id: 7, trackName: 'Su Vaiven', artistName: 'Grupo Extra' };

test('Deezer ISRC then ReccoBeats, cached after the first time', async () => {
  const h = harness((u) =>
    u.includes('deezer') ? json({ data: [{ title: 'Su Vaiven', isrc: 'ISRC1', artist: { name: 'Grupo Extra' } }] }) : json({ content: [recco] })
  );
  const r = await h.lookup.lookup(song);
  assert.equal(r?.status, 'measured');
  assert.equal(r?.status === 'measured' && r.features.tempo, 101);
  assert.equal(r?.status === 'measured' && r.source, 'live');
  await h.lookup.lookup(song);
  assert.equal(h.calls.length, 2);
  assert.equal((h.stored() as Record<number, { status: string }>)[7].status, 'measured');
});

test('no match is cached as unmatched', async () => {
  const h = harness(() => json({ data: [] }));
  assert.equal((await h.lookup.lookup(song))?.status, 'unmatched');
});

test('without a title or artist only the cache answers', async () => {
  const h = harness(() => json({}));
  assert.equal(await h.lookup.lookup({ id: 8 }), null);
  assert.equal(h.calls.length, 0);
});

test('a 429 pauses live lookups and caches nothing', async () => {
  const h = harness((u) =>
    u.includes('deezer') ? json({ data: [{ title: 'Su Vaiven', isrc: 'ISRC1', artist: { name: 'Grupo Extra' } }] }) : json({}, 429, { 'Retry-After': '120' })
  );
  assert.equal(await h.lookup.lookup(song), null);
  assert.equal(h.lookup.paused(), true);
  assert.equal(await h.lookup.lookup({ ...song, id: 9 }), null);
  assert.equal(h.calls.length, 2);
  assert.equal((h.stored() as Record<number, unknown>)[7], undefined);
});

test('a network error caches nothing so it can retry', async () => {
  const h = harness(() => { throw new Error('offline'); });
  assert.equal(await h.lookup.lookup(song), null);
  assert.equal((h.stored() as Record<number, unknown>)[7], undefined);
});
