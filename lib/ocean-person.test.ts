import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';

import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import type { SoundFeatures } from './sound.ts';
import { FULL_LISTEN_MS } from './dark-map.ts';
import { tasteDistance, tierFor } from './taste-distance.ts';
import { allPlaces, driftWater, placeKey, WATER_INFO } from './ocean-map.ts';
import { buildOcean, isAwake, portrait, stillBlind, whyLines, type OceanInput, type OceanLife } from './ocean-person.ts';

const DAY = 86_400_000;
const MONTH = 30 * DAY;
const NOW = new Date(2026, 10, 3, 12).getTime();
const bright: SoundFeatures = {
  tempo: 110, key: 0, mode: 1, energy: 0.7, danceability: 0.75,
  acousticness: 0.1, instrumentalness: 0.1, speechiness: 0.1,
  liveness: 0.1, valence: 0.8, loudness: -6,
};
const folk: SoundFeatures = {
  ...bright, tempo: 72, key: 6, mode: 0, energy: 0.2,
  danceability: 0.1, acousticness: 0.95, instrumentalness: 0.8, valence: 0.2,
};

function track(id: number, extra: Partial<DiscoveryTrack> = {}): DiscoveryTrack {
  return {
    id, trackName: `Imagined tide ${id}`, artistId: id, artistName: `Imagined artist ${id}`,
    artworkUrl100: '', primaryGenreName: 'Imaginary', previewUrl: '', trackViewUrl: '',
    collectionName: null, likedAt: NOW - MONTH, ...extra,
  };
}

function swipe(trackId: number, extra: Partial<SwipeEntry> = {}): SwipeEntry {
  return { trackId, artistId: trackId, genre: 'Imaginary', action: 'like',
    timestamp: NOW - MONTH, listenMs: FULL_LISTEN_MS, ...extra };
}

function input(extra: Partial<OceanInput> = {}): OceanInput {
  return { history: [], liked: [], soundOf: () => bright, depthOf: () => 'popular',
    colorOf: () => '#e99854', now: NOW, ...extra };
}

const creatures = (life: OceanLife) => Object.values(life.places).flatMap((p) => p.creatures);
const corals = (life: OceanLife) => Object.values(life.places).flatMap((p) => p.coral);
const sand = (life: OceanLife) => Object.values(life.places).flatMap((p) => p.sand.specks);

test('the same input gives the same complete ocean without changing its arrays', () => {
  const source = input({ liked: [track(1)], history: [swipe(1), swipe(2, { action: 'skip' })] });
  const before = structuredClone({ liked: source.liked, history: source.history });
  const life = buildOcean(source);
  assert.deepEqual(life, buildOcean(source));
  assert.deepEqual({ liked: source.liked, history: source.history }, before);
  assert.equal(Object.keys(life.places).length, 16);
  assert.deepEqual(Object.keys(life.places).sort(), allPlaces().map(placeKey).sort());
  assert.equal(life.total, 1);
  assert.equal(life.heardTotal, 2);
});

test('one song has different size, vividness, found hour and rarity for two people', () => {
  const night = new Date(2026, 2, 3, 2, 14).getTime();
  const morning = new Date(2026, 9, 3, 10, 30).getTime();
  const person = (at: number, listenMs: number, prior: SoundFeatures) => buildOcean(input({
    liked: [...Array.from({ length: 5 }, (_, i) => track(i + 1, { likedAt: at - DAY, foundBlind: true })), track(10, { likedAt: at })],
    history: [swipe(10, { timestamp: at, listenMs })],
    soundOf: (id) => id === 10 ? folk : prior,
  }));
  const a = creatures(person(night, FULL_LISTEN_MS, bright)).find((c) => c.trackId === 10)!;
  const b = creatures(person(morning, 3000, folk)).find((c) => c.trackId === 10)!;
  assert.ok(a.size > b.size);
  assert.ok(a.vivid > b.vivid);
  assert.equal(a.foundHour, 2);
  assert.equal(b.foundHour, 10);
  assert.equal(a.rare, true);
  assert.equal(b.rare, false);
  assert.equal(a.seed, b.seed);
});

test('100 hurried saves in one minute stay small and faint, even as they age', () => {
  const liked = Array.from({ length: 100 }, (_, i) => track(i + 1, { likedAt: NOW - 12 * MONTH + i * 500 }));
  const life = buildOcean(input({ liked, history: liked.map((t) => swipe(t.id, { timestamp: t.likedAt, listenMs: 3000 })) }));
  assert.equal(life.total, 100);
  assert.equal(life.oldest, null);
  for (const c of creatures(life)) {
    assert.ok(c.size <= 0.9);
    assert.ok(c.vivid <= 0.5);
    assert.equal(c.hurried, true);
    assert.equal(c.first, false);
  }
});

test('looked-up saves, skips and run likes alone do not hatch', () => {
  const life = buildOcean(input({ liked: [track(1), track(2), track(3)],
    history: [swipe(2, { source: 'run' }), swipe(3, { action: 'skip' })] }));
  assert.equal(life.total, 0);
  assert.equal(buildOcean(input({ liked: [track(1)] })).total, 0);
});

test('a foundBlind save survives Undo without a history entry', () => {
  const c = creatures(buildOcean(input({ liked: [track(1, { foundBlind: true })] })))[0];
  assert.equal(c.trackId, 1);
  assert.equal(c.heard, 0.5);
  assert.equal(c.hurried, false);
});

test('non-run likes and reveals hatch, including entries with no source', () => {
  const life = buildOcean(input({ liked: [track(1), track(2), track(3)],
    history: [swipe(1), swipe(2, { action: 'reveal', source: 'people' }), swipe(3, { action: 'reveal', source: 'run' })] }));
  assert.deepEqual(creatures(life).map((c) => c.trackId).sort(), [1, 2]);
});

test('deleting a revealed save makes coral and restoring it removes that coral', () => {
  const source = input({ liked: [track(1)], history: [swipe(1, { action: 'reveal' })] });
  assert.equal(corals(buildOcean(source)).length, 0);
  const deleted = buildOcean({ ...source, liked: [] });
  assert.equal(deleted.total, 0);
  assert.equal(corals(deleted)[0].trackId, 1);
  assert.equal(corals(deleted)[0].color, source.colorOf(1));
  assert.equal(buildOcean(source).total, 1);
  assert.equal(corals(buildOcean({ ...source, liked: [], history: [] })).length, 0);
});

test('only saves strictly older than the earliest log entry inherit old-find eligibility', () => {
  const life = buildOcean(input({
    liked: [track(1, { likedAt: NOW - 3 * DAY }), track(2, { likedAt: NOW - 2 * DAY }), track(3, { likedAt: undefined })],
    history: [swipe(90, { timestamp: NOW, action: 'skip' }), swipe(91, { timestamp: NOW - 2 * DAY, action: 'skip' })],
  }));
  assert.deepEqual(creatures(life).map((c) => c.trackId), [1]);
});

test('oldest dated unhurried find is first and strictly larger, including tied ages', () => {
  const liked = [track(1, { likedAt: NOW - 18 * MONTH }), track(2, { likedAt: NOW - 8 * MONTH }), track(3, { likedAt: NOW - 8 * MONTH })];
  const life = buildOcean(input({ liked, history: liked.map((t) => swipe(t.id, { listenMs: t.id === 1 ? 3000 : FULL_LISTEN_MS })) }));
  assert.equal(life.oldest?.trackId, 2);
  for (const c of creatures(life)) {
    assert.equal(c.first, c.trackId === 2);
    assert.ok(c.size >= 0.6 && c.size <= 1.9);
    if (!c.first) assert.ok(c.size < life.oldest!.size);
  }
});

test('size follows the age curve and vividness follows the longest listen', () => {
  const liked = [track(1, { likedAt: NOW - 9 * MONTH }), track(2, { likedAt: NOW - 4 * MONTH })];
  const history = [swipe(1), swipe(2, { listenMs: 3000 }), swipe(2, { action: 'skip', listenMs: 18_000 })];
  const c = creatures(buildOcean(input({ liked, history }))).find((c) => c.trackId === 2)!;
  assert.equal(c.size, 0.75 + 1.05 * (1 - Math.exp(-1)));
  assert.equal(c.heard, 0.75);
  assert.equal(c.vivid, 0.25 + 0.75 * 0.75);
  assert.equal(c.hurried, false);
});

test('later or simultaneous saves cannot change rarity, regardless of library order', () => {
  const prior = Array.from({ length: 5 }, (_, i) => track(i + 1, { likedAt: NOW - 2 * MONTH, foundBlind: true }));
  const target = track(10);
  const source = input({ liked: [...prior, target], history: [swipe(10)], soundOf: (id) => id <= 5 ? bright : folk });
  const find = (source: OceanInput) => creatures(buildOcean(source)).find((c) => c.trackId === 10)!;
  assert.equal(find(source).rare, true);
  const later = Array.from({ length: 10 }, (_, i) => track(20 + i, { likedAt: i < 5 ? target.likedAt : NOW, foundBlind: true }));
  assert.equal(find({ ...source, liked: [...later, target, ...prior].reverse() }).rare, true);
  assert.equal(find({ ...source, liked: [target, ...prior.slice(0, 4)] }).rare, false);
});

test('undated saves neither invent an age nor enter a dated rarity baseline', () => {
  const liked = Array.from({ length: 5 }, (_, i) => track(i + 1, { likedAt: undefined, foundBlind: true }));
  const life = buildOcean(input({ liked: [...liked, track(10)], history: [swipe(10)], soundOf: (id) => id === 10 ? folk : bright }));
  assert.equal(creatures(life).find((c) => c.trackId === 10)!.rare, false);
  const c = creatures(life).find((c) => c.trackId === 1)!;
  assert.equal(c.likedAt, null);
  assert.equal(c.foundHour, null);
  assert.equal(c.first, false);
  assert.ok(whyLines(c, NOW).every((line) => !line.includes('months') && !line.includes('am.')));
});

test('rarity agrees with tasteDistance across varied earlier libraries', () => {
  const sounds = Array.from({ length: 80 }, (_, i): SoundFeatures => ({ ...bright,
    tempo: 60 + i * 13 % 110, key: i % 12, energy: (i * 17 % 100) / 100,
    acousticness: (i * 23 % 100) / 100, instrumentalness: (i * 37 % 100) / 100,
    danceability: (i * 41 % 100) / 100,
  }));
  const liked = sounds.map((_, i) => track(i + 1, { likedAt: NOW - (80 - i) * DAY, foundBlind: true }));
  const life = buildOcean(input({ liked, soundOf: (id) => sounds[id - 1] }));
  for (const c of creatures(life)) {
    const i = c.trackId - 1;
    const distance = tasteDistance(sounds[i], sounds.slice(0, i));
    assert.equal(c.rare, distance !== null && tierFor(distance) === 'deep');
  }
});

test('awake hours wrap around midnight and an undated find is always awake', () => {
  const c = creatures(buildOcean(input({ liked: [track(1, { foundBlind: true })] })))[0];
  for (const hour of [2, 7, 21, 2 + 24]) assert.equal(isAwake({ ...c, foundHour: 2 }, hour), true);
  for (const hour of [9, 19]) assert.equal(isAwake({ ...c, foundHour: 2 }, hour), false);
  assert.equal(isAwake({ ...c, foundHour: 2 }, 20), true);
  assert.equal(isAwake({ ...c, foundHour: 2 }, 8), false);
  for (let hour = 0; hour < 24; hour++) assert.equal(isAwake({ ...c, foundHour: null }, hour), true);
});

test('sand needs a non-run skip or genre jump heard for at least two seconds', () => {
  const life = buildOcean(input({ history: [
    swipe(1, { action: 'skip', listenMs: 1999 }),
    swipe(2, { action: 'skip', source: 'run' }),
    swipe(3, { action: 'skip', listenMs: 2000 }),
    swipe(4, { action: 'genre-jump', listenMs: 2000 }),
    swipe(5, { action: 'genre-jump', source: 'run' }),
    swipe(6, { action: 'steer-sound' }),
  ] }));
  assert.equal(sand(life).length, 2);
  assert.ok(life.places[placeKey({ water: 'reef', depth: 'popular' })].sand.rise > 0);
});

test('coral and sand are deterministic, deduplicated and capped per place', () => {
  const history = Array.from({ length: 400 }, (_, i) => swipe(i + 1, { action: i < 200 ? 'reveal' : 'skip' }));
  const life = buildOcean(input({ history: [...history, ...history] }));
  const p = life.places[placeKey({ water: 'reef', depth: 'popular' })];
  assert.equal(p.coral.length, 48);
  assert.equal(p.sand.specks.length, 160);
  assert.equal(p.sand.rise, 1);
  assert.equal(new Set(p.coral.map((c) => c.trackId)).size, 48);
  assert.ok(p.coral.every((c) => [0, 1, 2].includes(c.form) && c.size > 0));
  assert.deepEqual(life, buildOcean(input({ history: [...history, ...history] })));
});

test('legacy entries with no source or listen time count as half heard', () => {
  const life = buildOcean(input({ liked: [track(1)], history: [swipe(1, { listenMs: undefined }), swipe(2, { action: 'skip', listenMs: undefined })] }));
  assert.equal(creatures(life)[0].heard, 0.5);
  assert.equal(creatures(life)[0].vivid, 0.625);
  assert.equal(life.heardTotal, 2);
  assert.equal(sand(life).length, 1);
});

test('zero listens do not invent hearing and excessive listens clamp to full', () => {
  const life = buildOcean(input({ liked: [track(1), track(2)], history: [swipe(1, { listenMs: 0 }), swipe(2, { listenMs: FULL_LISTEN_MS * 4 })] }));
  const [zero, full] = creatures(life).sort((a, b) => a.trackId - b.trackId);
  assert.equal(zero.heard, 0);
  assert.equal(zero.vivid, 0.25);
  assert.equal(full.heard, 1);
  assert.equal(life.heardTotal, 1);
});

test('no sound data gives a drifter in its hashed water at the supplied depth', () => {
  const life = buildOcean(input({ liked: [track(17, { foundBlind: true })], soundOf: () => null, depthOf: () => 'buried' }));
  const c = creatures(life)[0];
  assert.equal(c.kind, 'drifter');
  assert.deepEqual(c.place, { water: driftWater(17), depth: 'buried' });
  assert.equal(c.rare, false);
  assert.equal(life.heardTotal, 1);
  assert.ok(whyLines(c, NOW).some((line) => /sound.*(?:measured|data)|(?:measured|data).*sound/i.test(line)));
  assert.ok(whyLines(c, NOW).every((line) => !/undefined|NaN|quiet song|slow song/i.test(line)));
});

test('schools require at least two saves from the same artist in the same place', () => {
  const liked = [track(1, { artistId: 7 }), track(2, { artistId: 7 }), track(3, { artistId: 7 }), track(4, { artistId: 8 })];
  const life = buildOcean(input({ liked, history: liked.map((t) => swipe(t.id)), depthOf: (t) => ('id' in t ? t.id : t.trackId) === 3 ? 'buried' : 'popular' }));
  const byId = new Map(creatures(life).map((c) => [c.trackId, c]));
  assert.ok(byId.get(1)!.school);
  assert.equal(byId.get(1)!.school, byId.get(2)!.school);
  assert.equal(byId.get(3)!.school, null);
  assert.equal(byId.get(4)!.school, null);
});

test('stillBlind only hides the currently blind card', () => {
  assert.equal(stillBlind(5, { id: 5, revealed: false }), true);
  assert.equal(stillBlind(5, { id: 5, revealed: true }), false);
  assert.equal(stillBlind(5, { id: 6, revealed: false }), false);
  assert.equal(stillBlind(5, null), false);
});

test('why lines explain age and exact local discovery time in plain sentences', () => {
  const at = new Date(2026, 2, 3, 2, 14).getTime();
  const c = creatures(buildOcean(input({ liked: [track(1, { likedAt: at })], history: [swipe(1)], now: at + 8 * MONTH })))[0];
  const lines = whyLines(c, at + 8 * MONTH);
  assert.ok(lines.includes("Big because you've had it 8 months."));
  assert.ok(lines.includes('Out at night because you found it at 2:14am.'));
  assert.ok(lines.every((line) => line.endsWith('.') && !/undefined|NaN/.test(line)));
});

test('portraits differ and never say songs live in unheard waters', () => {
  const at = new Date(2026, 9, 3, 2, 14).getTime();
  const night = buildOcean(input({ liked: [track(1, { likedAt: at })], history: [swipe(1)], soundOf: () => ({ ...bright, valence: 0.1 }) }));
  const day = buildOcean(input({ liked: [track(1)], history: [swipe(1)] }));
  assert.notDeepEqual(portrait(night, NOW), portrait(day, NOW));
  const lives = portrait(night, NOW).filter((line) => /\blives?\b/.test(line));
  assert.ok(lives.some((line) => line.includes(WATER_INFO.midnight.name)));
  for (const water of ['reef', 'kelp', 'blue'] as const) assert.ok(lives.every((line) => !line.includes(WATER_INFO[water].name)));
  assert.ok(portrait(buildOcean(input()), NOW).every((line) => !/\blives?\b/.test(line)));
  const unheard = buildOcean(input({ liked: [track(1)], history: [swipe(1, { listenMs: 0 })] }));
  assert.ok(portrait(unheard, NOW).every((line) => !/\blives?\b/.test(line)));
});

test('the ocean does not shrink or lose color after time away', () => {
  const source = input({ liked: [track(1), track(2)], history: [swipe(1), swipe(2, { listenMs: 3000 }), swipe(3, { action: 'reveal' }), swipe(4, { action: 'skip' })] });
  const before = buildOcean(source);
  const after = buildOcean({ ...source, now: NOW + 18 * MONTH });
  assert.equal(after.total, before.total);
  assert.deepEqual(corals(after), corals(before));
  assert.deepEqual(sand(after), sand(before));
  for (const c of creatures(before)) {
    const later = creatures(after).find((other) => other.trackId === c.trackId)!;
    assert.ok(later.size >= c.size);
    assert.equal(later.vivid, c.vivid);
    assert.equal(later.color, c.color);
  }
});

// About 43 ms on this Mac alone. The limit is high so a busy machine can't fail it, and only a real slowdown can.
test('building 5000 swipes and 500 saves stays quick enough to build between swipes', (t) => {
  const history = Array.from({ length: 5000 }, (_, i) => swipe(i + 1, {
    timestamp: NOW - (5000 - i) * 60_000, action: i < 500 ? 'like' : i % 3 ? 'skip' : 'reveal',
  }));
  const liked = history.slice(0, 500).map((e) => track(e.trackId, { likedAt: e.timestamp }));
  const source = input({ history, liked, soundOf: (id) => ({ ...bright,
    tempo: 60 + id % 110, energy: (id % 100) / 100, acousticness: (id % 70) / 70,
    instrumentalness: (id % 60) / 60, danceability: (id % 90) / 90,
  }) });
  const start = performance.now();
  const life = buildOcean(source);
  const elapsed = performance.now() - start;
  t.diagnostic(`Build time for 5000 swipes and 500 saves: ${elapsed.toFixed(2)} ms`);
  assert.equal(life.total, 500);
  assert.equal(life.heardTotal, 5000);
  assert.ok(elapsed < 600, `Build took ${elapsed.toFixed(2)} ms`);
});

const risen = (extra: Partial<OceanInput>) => buildOcean(input({ history: [swipe(1)], liked: [track(1, { artistListeners: 10_000 })], depthOf: () => 'buried', ...extra }));

test('a fish climbs as its artist gains listeners: every fourfold rise is one level', () => {
  const c = Object.values(risen({ listenersNowOf: () => 90_000 }).places).flatMap((p) => p.creatures)[0];
  assert.equal(c.foundRow, 3);
  assert.ok(c.climb > 1.5 && c.climb < 1.6);
  assert.equal(c.place.depth, 'gems');
  assert.ok(whyLines(c, NOW).includes('Found in Buried at 10K. Now 90K, so it has climbed to Hidden gems.'));
});

test('a fish with no count, or whose artist has not grown, stays where you found it', () => {
  const only = (extra: Partial<OceanInput>) => Object.values(risen(extra).places).flatMap((p) => p.creatures)[0];
  assert.equal(only({}).place.depth, 'buried');
  assert.equal(only({ listenersNowOf: () => null }).climb, 0);
  assert.equal(only({ listenersNowOf: () => 9_000 }).place.depth, 'buried');
  assert.equal(only({ listenersNowOf: () => 10_500 }).climb, 0);
});

test('the portrait names your biggest climber', () => {
  assert.ok(portrait(risen({ listenersNowOf: () => 90_000 }), NOW).includes('Your biggest climber went from 10K listeners to 90K.'));
});
