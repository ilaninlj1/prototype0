import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addReveal, beatIndex, EDITION_SIZE, EMPTY_EDITIONS, frameLabel, removeReveal, sceneAt, timecode, timeline, TOTAL, wipes, type EditionSong } from './edition.ts';
import { recipeFor } from './print-recipe.ts';

const song = (id: number): EditionSong => ({ trackId: id, title: `t${id}`, artist: `a${id}`, artwork: '', recipe: recipeFor(id, null, null), heard: 1 });
const reveal = (state = EMPTY_EDITIONS, ids: number[], now = 1) => ids.reduce((s, id) => addReveal(s, song(id), now).state, state);

test('every 5th reveal makes an edition of those 5, numbered from 1', () => {
  let s = reveal(EMPTY_EDITIONS, [1, 2, 3, 4]);
  assert.equal(s.editions.length, 0);
  const out = addReveal(s, song(5), 9);
  assert.equal(out.made?.number, 1);
  assert.deepEqual(out.made?.songs.map((x) => x.trackId), [1, 2, 3, 4, 5]);
  assert.equal(out.made?.createdAt, 9);
  s = out.state;
  assert.equal(s.pending.length, 0);
  assert.equal(s.unseen, 1);
  s = reveal(s, [6, 7, 8, 9, 10]);
  assert.equal(s.editions.at(-1)?.number, 2);
  assert.equal(EDITION_SIZE, 5);
});

test('the same song twice counts once', () => {
  const s = reveal(EMPTY_EDITIONS, [1, 1, 2]);
  assert.deepEqual(s.pending.map((x) => x.trackId), [1, 2]);
});

test('undoing a reveal takes it back out, even the one that just made an edition', () => {
  let s = reveal(EMPTY_EDITIONS, [1, 2]);
  s = removeReveal(s, 2);
  assert.deepEqual(s.pending.map((x) => x.trackId), [1]);
  s = reveal(s, [2, 3, 4, 5]);
  assert.equal(s.editions.length, 1);
  s = removeReveal(s, 5);
  assert.equal(s.editions.length, 0);
  assert.equal(s.unseen, null);
  assert.deepEqual(s.pending.map((x) => x.trackId), [1, 2, 3, 4]);
  assert.equal(removeReveal(s, 99), s);
});

test('the timeline: intro, one scene per song, then the outro', () => {
  const e = addReveal(reveal(EMPTY_EDITIONS, [1, 2, 3, 4]), song(5), 1).made!;
  const scenes = timeline(e);
  assert.equal(scenes[0].kind, 'intro');
  assert.equal(scenes.at(-1)!.kind, 'outro');
  // Every edition shows all five of the reel's families, in a rotating order.
  assert.deepEqual(new Set(scenes.slice(1, 6).map((x) => x.kind)), new Set(['voxel', 'wall', 'data', 'particles', 'interface']));
  assert.equal(scenes.length, 7);
  assert.deepEqual(scenes.slice(1, 6).map((x) => x.song), [0, 1, 2, 3, 4]);
  assert.equal(scenes.at(-1)!.end, TOTAL);
  for (let i = 1; i < scenes.length; i++) assert.equal(scenes[i].start, scenes[i - 1].end);
  // Families rotate, so five finds never get the same look twice in a row.
  for (let i = 2; i < 6; i++) assert.notEqual(scenes[i].kind, scenes[i - 1].kind);
});

test('sceneAt finds the scene and how far into it', () => {
  const e = addReveal(reveal(EMPTY_EDITIONS, [1, 2, 3, 4]), song(5), 1).made!;
  const scenes = timeline(e);
  assert.equal(sceneAt(scenes, 0).index, 0);
  const mid = sceneAt(scenes, (scenes[2].start + scenes[2].end) / 2);
  assert.equal(mid.index, 2);
  assert.ok(Math.abs(mid.local - 0.5) < 1e-9);
  assert.equal(sceneAt(scenes, TOTAL + 5).index, scenes.length - 1);
  assert.equal(sceneAt(scenes, TOTAL + 5).local, 1);
});

test('the frame counter and timecode read like the reel: 24 frames a second', () => {
  assert.equal(frameLabel(0), `F 0000 / ${String(Math.round(TOTAL * 24)).padStart(4, '0')}`);
  assert.equal(frameLabel(5.04).slice(0, 6), 'F 0120');
  assert.equal(timecode(5.5), '00:05:12');
  assert.equal(timecode(0), '00:00:00');
});

test('wipes cover each cut between scenes, alternating color and direction', () => {
  const e = addReveal(reveal(EMPTY_EDITIONS, [1, 2, 3, 4]), song(5), 1).made!;
  const scenes = timeline(e);
  const w = wipes(scenes);
  assert.equal(w.length, scenes.length - 1);
  assert.deepEqual(w.map((x) => x.t), scenes.slice(1).map((x) => x.start));
  for (let i = 1; i < w.length; i++) {
    assert.notEqual(w[i].color, w[i - 1].color);
    assert.notEqual(w[i].dir, w[i - 1].dir);
  }
});

test("beat squares tick at the song's own tempo, four to a cycle", () => {
  assert.equal(beatIndex(0, 120), 0);
  assert.equal(beatIndex(0.51, 120), 1);
  assert.equal(beatIndex(2.01, 120), 0);
  assert.equal(beatIndex(0.51, 60), 0);
});
