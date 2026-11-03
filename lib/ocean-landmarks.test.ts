import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHAIN_LEVELS, LANDMARKS, hitLandmark, landmarkSpot, landmarksAt } from './ocean-landmarks.ts';
import { floorAt } from './ocean-scene.ts';

const W = 390;
const H = 844;

test('anything lying on the ground is at the bottom of Buried, the only ground there is', () => {
  for (const l of LANDMARKS) if (l.fy == null) assert.equal(l.place.depth, 'buried', l.kind);
});

test('the anchor story reads downward through the kelp: boat, then the break, then the anchor', () => {
  const at = (k: string) => LANDMARKS.find((l) => l.kind === k)!;
  assert.equal(at('boat').place.water, 'kelp');
  assert.equal(at('chain').place.water, 'kelp');
  assert.equal(at('anchor').place.water, 'kelp');
  assert.equal(at('boat').place.depth, 'popular');
  assert.equal(at('chain').place.depth, 'deepcuts');
  assert.equal(at('anchor').place.depth, 'buried');
  assert.equal(at('boat').fx, at('chain').fx, 'the chain hangs straight down from the boat');
  assert.deepEqual(CHAIN_LEVELS, ['popular', 'deepcuts']);
});

test('every landmark has one short line, in plain words, and sits on screen', () => {
  for (const l of LANDMARKS) {
    assert.ok(l.note.length > 0 && l.note.length <= 64, l.note);
    const s = landmarkSpot(l, W, H);
    assert.ok(s.x > 0 && s.x < W && s.y > 0 && s.y < H, l.kind);
  }
  assert.equal(new Set(LANDMARKS.map((l) => l.note)).size, LANDMARKS.length);
});

test('a landmark on the floor rests on its own biome’s sand', () => {
  const anchor = LANDMARKS.find((l) => l.kind === 'anchor')!;
  assert.equal(landmarkSpot(anchor, W, H).y, H - floorAt(1, anchor.fx) * H);
});

test('each place shows only its own, and most have none, so finding one means something', () => {
  assert.deepEqual(landmarksAt({ water: 'blue', depth: 'buried' }).map((l) => l.kind), ['wreck']);
  assert.deepEqual(landmarksAt({ water: 'reef', depth: 'popular' }), []);
});

test('a tap finds the nearest landmark in reach, and open water finds nothing', () => {
  const list = landmarksAt({ water: 'blue', depth: 'buried' });
  const spots = list.map((l) => landmarkSpot(l, W, H));
  assert.equal(hitLandmark(spots[0].x + 10, spots[0].y, list, spots, 1.4)?.kind, 'wreck');
  assert.equal(hitLandmark(0, 0, list, spots, 1.4), null);
  assert.equal(hitLandmark(0, 0, [], [], 1.4), null);
});
