import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blink, currentDrift, flourish, homeAt, restSpot, scatter, schoolOffset, stagePoses, swimPose, tempoMatches } from './ocean-motion.ts';
import { floorAt } from './ocean-scene.ts';

const W = 390;
const H = 844;
const KINDS = ['clown', 'darter', 'turtle', 'jelly', 'puffer', 'manta', 'seahorse', 'eel', 'drifter'];
const fish = { seed: 7, pace: 1, band: 0.4, x: 0.3, look: 'clown' };

test('one moment gives one pose', () => {
  assert.deepEqual(swimPose(fish, 12.5, W, H), swimPose(fish, 12.5, W, H));
});

test('every kind stays on screen and in the water column, however long you watch', () => {
  for (const look of KINDS) {
    for (const band of [0, 1]) {
      for (const x of [0, 1]) {
        for (let t = 0; t < 2000; t += 7.3) {
          const p = swimPose({ ...fish, look, band, x }, t, W, H);
          assert.ok(p.x > -80 && p.x < W + 80, `${look} x ${p.x}`);
          assert.ok(p.y > H * 0.08 && p.y < H * 0.86, `${look} y ${p.y}`);
        }
      }
    }
  }
});

test('nothing crosses like a conveyor belt: each one turns around', () => {
  for (const look of ['clown', 'darter', 'turtle', 'manta', 'eel', 'puffer']) {
    const faces = new Set<number>();
    for (let t = 0; t < 400; t += 1.1) faces.add(Math.sign(swimPose({ ...fish, look }, t, W, H).face));
    assert.ok(faces.has(1) && faces.has(-1), look);
  }
});

test('turning is gradual: facing never flips in one small step', () => {
  for (let t = 0; t < 200; t += 0.05) {
    const a = swimPose(fish, t, W, H).face;
    const b = swimPose(fish, t + 0.05, W, H).face;
    assert.ok(Math.abs(a - b) < 0.3, `at ${t}: ${a} to ${b}`);
  }
});

test('kinds move differently: a darter covers far more ground than a seahorse', () => {
  const travel = (look: string) => {
    let d = 0;
    for (let t = 0; t < 120; t += 0.5) d += Math.abs(swimPose({ ...fish, look }, t + 0.5, W, H).x - swimPose({ ...fish, look }, t, W, H).x);
    return d;
  };
  assert.ok(travel('darter') > travel('seahorse') * 3);
});

test('faster songs move faster', () => {
  const travel = (pace: number) => {
    let d = 0;
    for (let t = 0; t < 120; t += 0.5) d += Math.abs(swimPose({ ...fish, pace }, t + 0.5, W, H).x - swimPose({ ...fish, pace }, t, W, H).x);
    return d;
  };
  assert.ok(travel(1.4) > travel(0.7));
});

test('each creature does its move now and then, not all at once', () => {
  let on = 0;
  for (let t = 0; t < 600; t += 0.1) if (flourish(7, t) > 0) on += 1;
  assert.ok(on > 0 && on < 6000 * 0.15, `${on}`);
  const at = (seed: number) => Array.from({ length: 300 }, (_, t) => flourish(seed, t * 0.5) > 0.5);
  assert.notDeepEqual(at(7), at(99));
});

test('a puffer swells during its move and a manta loops', () => {
  let puff = 1;
  let spin = 0;
  for (let t = 0; t < 200; t += 0.1) {
    puff = Math.max(puff, swimPose({ ...fish, look: 'puffer' }, t, W, H).puff);
    spin = Math.max(spin, swimPose({ ...fish, look: 'manta' }, t, W, H).spin);
  }
  assert.ok(puff > 1.4);
  assert.ok(spin > 5);
});

test('tempo matching: same, half and double within 4%, and nothing else', () => {
  assert.equal(tempoMatches(120, 121), true);
  assert.equal(tempoMatches(60, 120), true);
  assert.equal(tempoMatches(240, 120), true);
  assert.equal(tempoMatches(120, 130), false);
  assert.equal(tempoMatches(0, 120), false);
  assert.equal(tempoMatches(120, 0), false);
});

test('above the floor sleepers hang spread out in the water, never in a pile', () => {
  const spots = Array.from({ length: 40 }, (_, i) => restSpot(i * 31 + 1, i, 40, 1, 1, W, H));
  assert.ok(Math.max(...spots.map((s) => s.x)) - Math.min(...spots.map((s) => s.x)) > W * 0.7);
  for (const s of spots) assert.ok(s.y > H * 0.25 && s.y < H * 0.75);
  assert.equal(new Set(spots.map((s) => Math.round(s.x))).size, 40);
});

test('on the floor they lie on the sand of their own biome', () => {
  for (const col of [0, 3]) {
    const spots = Array.from({ length: 12 }, (_, i) => restSpot(i * 31 + 1, i, 12, col, 3, W, H));
    for (const s of spots) {
      const sand = H - floorAt(col, s.x / W) * H;
      assert.ok(s.y < sand && s.y > sand - 14, `${s.y} vs ${sand}`);
    }
    assert.ok(Math.max(...spots.map((s) => s.x)) - Math.min(...spots.map((s) => s.x)) > W * 0.5);
  }
});

test('a small reach keeps a creature close to home: clownfish stay by their anemone', () => {
  const home = homeAt(0.5, 0.5);
  let far = 0;
  for (let t = 0; t < 300; t += 1) {
    const p = swimPose({ ...fish, ...home, look: 'clown', reach: 0.25 }, t, W, H);
    far = Math.max(far, Math.hypot(p.x - W * 0.5, p.y - H * 0.5));
  }
  assert.ok(far < W * 0.12, `${far}`);
});

test('everyone in Open blue rides the same current, and nobody elsewhere does', () => {
  const m = { seed: 3, pace: 1, band: 0.5, x: 0.5, look: 'clown', awake: true, leader: -1, schoolIndex: 0, restI: 0, restN: 1 };
  const blue = stagePoses([m], 2, 1, 40, W, H)[0];
  const kelp = stagePoses([m], 1, 1, 40, W, H)[0];
  const [dx] = currentDrift(kelp.x, 40, W);
  assert.ok(Math.abs(blue.x - kelp.x - dx) < 1e-6);
});

test('in Midnight a creature flashes now and then, and partners flash together', () => {
  let lit = 0;
  for (let t = 0; t < 100; t += 0.05) if (blink(9, t) > 0) lit += 1;
  assert.ok(lit > 0 && lit < 2000 * 0.3);
  assert.equal(blink(9, 12.3), blink(9, 12.3));
});

test('the drawing and the tap test get the same answer, including sleepers and schools', () => {
  const members = [
    { seed: 1, pace: 1, band: 0.2, x: 0.2, look: 'clown', awake: true, leader: -1, schoolIndex: 0, restI: -1, restN: 1 },
    { seed: 2, pace: 1, band: 0.5, x: 0.6, look: 'clown', awake: true, leader: 0, schoolIndex: 1, restI: -1, restN: 1 },
    { seed: 3, pace: 1, band: 0.5, x: 0.6, look: 'turtle', awake: false, leader: -1, schoolIndex: 0, restI: 0, restN: 1 },
  ];
  const poses = stagePoses(members, 0, 0, 30, W, H);
  assert.equal(poses.length, 3);
  const lead = swimPose(members[0], 30, W, H);
  assert.ok(Math.abs(poses[1].x - lead.x) < 60, 'a follower stays near its leader');
  assert.notEqual(poses[1].x, lead.x);
  assert.deepEqual([poses[2].x, poses[2].tail], [restSpot(3, 0, 1, 0, 0, W, H).x, 0]);
});

test('a school spreads out, and each offset is its own', () => {
  assert.equal(new Set(Array.from({ length: 16 }, (_, i) => schoolOffset(i).join())).size, 16);
  assert.deepEqual(schoolOffset(0), [0, 0]);
});

test('scatter pushes away inside its reach and is nothing outside it', () => {
  assert.deepEqual(scatter(200, 200, 100, 200, 90), [0, 0]);
  const [dx, dy] = scatter(120, 200, 100, 200, 90);
  assert.ok(dx > 0);
  assert.equal(dy, 0);
  assert.ok(scatter(110, 200, 100, 200, 90)[0] > dx);
  assert.ok(scatter(100, 200, 100, 200, 90)[0] > 0);
});
