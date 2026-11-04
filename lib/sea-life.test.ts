import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CALM_WEATHER, skyAt } from './home-sky.ts';
import { FLY_PASS_S, sceneAt, type Scene, type SeaLifeKind, type Sighting } from './sea-life.ts';
import { colorsFor, dolphinsAwake, fishAreUp, isFar, makeSighting, nextGap, pickKind, stillPlan } from './sea-life-plan.ts';

const KINDS: SeaLifeKind[] = ['fly', 'bait', 'seal', 'pod', 'hump', 'sperm', 'blue'];
const make = (kind: SeaLifeKind, o: Partial<Parameters<typeof makeSighting>[1]> = {}) => makeSighting(kind, { width: 390, screenH: 844, horizon: 704, hour: 12, wind: 0.5, ...o });
const paths = (s: Scene) => s.layers.flatMap((l) => Object.values(l)).concat(s.glassFill, s.glassRim, s.glassDot, s.glassTrail);
const any = (s: Scene, layer: number) => Object.values(s.layers[layer]).some((v) => v.length > 0);
const topOf = (d: string) => Math.min(...[...d.matchAll(/[ML]-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1])));
const widthOf = (d: string) => {
  const xs = [...d.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
  return Math.max(...xs) - Math.min(...xs);
};

test('every animal draws something, stays valid all the way through, and is gone by the end', () => {
  for (const kind of KINDS) {
    for (const ending of ['dive', 'fluke', 'breach'] as const) {
      const s: Sighting = { ...make(kind), ...(kind === 'hump' ? { ending } : {}) };
      let drew = false;
      for (let t = 0; t <= s.duration; t += 0.2) {
        const scene = sceneAt(s, t);
        for (const d of paths(scene)) assert.doesNotMatch(d, /NaN|undefined|Infinity/, `${kind} at ${t}`);
        if (scene.layers.some((_, i) => any(scene, i))) drew = true;
      }
      assert.ok(drew, `${kind} drew nothing`);
      assert.equal(paths(sceneAt(s, s.duration + 1)).join(''), '');
    }
  }
});

test('further away means smaller, from real lengths: a blue whale is longer than a humpback, and a dolphin is shorter', () => {
  const back = (kind: SeaLifeKind, at: number) => sceneAt({ ...make(kind), ending: 'dive' }, at).layers[0].back;
  assert.ok(widthOf(back('blue', 3.5)) > widthOf(back('hump', 2.1)));
  const leaping = make('pod', { forceLeap: true });
  const sizes: number[] = [];
  for (let t = 0; t < leaping.duration; t += 0.1) {
    const d = sceneAt({ ...leaping, members: 1, x: 200, dir: 1 }, t).layers[0].back;
    if (d) sizes.push(widthOf(d));
  }
  assert.ok(Math.max(...sizes) < widthOf(back('hump', 2.1)) * 1.1);
});

test('nothing shows below the water it comes out of', () => {
  const s = { ...make('hump'), ending: 'breach' as const };
  const y0 = s.horizon + (1.5 * 300) / s.z;
  for (let t = s.n * s.gap; t < s.duration; t += 0.1) {
    const d = sceneAt(s, t).layers[0].back;
    if (!d) continue;
    const ys = [...d.matchAll(/[ML]-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
    assert.ok(Math.max(...ys) <= y0 + 1.1, `at ${t}`);
  }
});

test('a whale stays on screen for its whole run of breaths and its leaving', () => {
  for (const kind of ['hump', 'blue', 'sperm'] as const) {
    for (const dir of [0.2, 0.8]) {
      for (const lucky of [0.05, 0.3, 0.6, 0.95]) {
        const values = [dir, lucky];
        let i = 0;
        const s = makeSighting(kind, { width: 390, screenH: 844, horizon: 704, hour: 12, wind: 0.8, rand: () => values[i++ % 2] });
        for (let t = 0; t < s.duration - 1; t += 0.25) {
          const d = sceneAt(s, t).layers[0].back;
          if (!d) continue;
          const xs = [...d.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
          assert.ok((Math.max(...xs) + Math.min(...xs)) / 2 > 0 && (Math.max(...xs) + Math.min(...xs)) / 2 < 390, `${kind} ${s.ending} off screen at ${t}: ${Math.min(...xs)} to ${Math.max(...xs)}`);
        }
      }
    }
  }
});

test('a breach really leaves the water', () => {
  const s = { ...make('hump'), ending: 'breach' as const };
  const y0 = s.horizon + (1.5 * 300) / s.z;
  const crest = sceneAt(s, s.n * s.gap + 1.3).layers[0].back;
  assert.ok(topOf(crest) < y0 - 25, `top ${topOf(crest)} from ${y0}`);
});

test('the flying fish starts far away, grows, ends in front of the buttons, and leaves spray on the glass', () => {
  const s = make('fly');
  const early = sceneAt(s, 0.5);
  assert.equal(any(early, 2), false);
  const late = sceneAt(s, FLY_PASS_S - 0.1);
  assert.equal(any(late, 2), true);
  assert.ok(late.fade < 1, 'it fades as it passes the camera');
  assert.equal(sceneAt(s, FLY_PASS_S - 3).layers[2].back, '');
  assert.ok(sceneAt(s, FLY_PASS_S + 0.4).glassFill.length > 0);
});

test('the time of day decides what comes up', () => {
  assert.equal(fishAreUp(12), false);
  assert.equal(fishAreUp(22), true);
  assert.equal(fishAreUp(3), true);
  assert.equal(dolphinsAwake(12), false);
  assert.equal(dolphinsAwake(19), true);
  assert.equal(make('pod', { hour: 12 }).leap, false);
  assert.equal(make('pod', { hour: 22 }).leap, true);
  let i = 0;
  const seq = () => (i = (i + 0.0137) % 1);
  for (let n = 0; n < 200; n++) assert.notEqual(pickKind(12, seq), 'bait');
  const seen = new Set<SeaLifeKind>();
  for (let n = 0; n < 400; n++) seen.add(pickKind(22, seq));
  assert.ok(seen.has('bait'));
  assert.equal(seen.size, 7);
});

test('more wind, more breaches', () => {
  let i = 0;
  const seq = () => (i = (i + 0.0731) % 1);
  const count = (wind: number) => {
    let n = 0;
    for (let k = 0; k < 400; k++) if (makeSighting('hump', { width: 390, screenH: 844, horizon: 704, hour: 12, wind, rand: seq }).ending === 'breach') n += 1;
    return n;
  };
  assert.ok(count(1) > count(0.1) * 1.8);
});

test('sightings stay rare while you swipe', () => {
  assert.ok(nextGap(() => 0) >= 60);
  assert.ok(nextGap(() => 1) <= 150);
});

test('leaving a song alone wakes the sea: close things first, then dolphins, a whale last, all inside one preview', () => {
  const rolls = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
  for (const a of rolls) for (const b of rolls) for (const c of rolls) {
    const values = [a, b, c];
    let i = 0;
    const plan = stillPlan(12, () => values[i++ % 3]);
    assert.equal(isFar(plan[0].kind), false);
    assert.equal(plan[1].kind, 'pod');
    assert.equal(isFar(plan[2].kind), false);
    assert.notEqual(plan[0].kind, plan[2].kind);
    assert.ok(['hump', 'sperm', 'blue'].includes(plan[3].kind));
    assert.ok(plan.every((p, k) => k === 0 || p.at > plan[k - 1].at));
    assert.ok(plan[3].at < 27 - 5, 'the whale has time to be seen before the preview ends');
    for (const p of plan) assert.notEqual(p.kind, 'bait', 'small fish only come up from dusk to dawn');
  }
  let i = 0;
  const seq = () => (i = (i + 0.137) % 1);
  const seen = new Set<SeaLifeKind>();
  for (let n = 0; n < 200; n++) for (const p of stillPlan(22, seq)) seen.add(p.kind);
  assert.ok(seen.has('bait'));
});

test('a quick whale comes up sooner than a normal one, and breaches more often', () => {
  const at = (quick: boolean) => makeSighting('hump', { width: 390, screenH: 844, horizon: 704, hour: 12, wind: 0.5, quick, rand: () => 0.9 });
  assert.ok(at(true).n < at(false).n);
  assert.ok(at(true).duration < at(false).duration);
  let i = 0;
  const seq = () => (i = (i + 0.0731) % 1);
  const breaches = (quick: boolean) => {
    let n = 0;
    for (let k = 0; k < 400; k++) if (makeSighting('hump', { width: 390, screenH: 844, horizon: 704, hour: 12, wind: 0.3, quick, rand: seq }).ending === 'breach') n += 1;
    return n;
  };
  assert.ok(breaches(true) > breaches(false));
});

test('a far animal is hazed toward the horizon', () => {
  const look = skyAt(12.5, CALM_WEATHER);
  assert.notEqual(colorsFor(make('blue'), look).back, '#5f7890');
  assert.match(colorsFor(make('fly'), look).wing, /^#[0-9a-f]{6}$/);
});

test('every function a frame calls is marked as a worklet', () => {
  // On a phone these run on the UI thread, where calling a function that isn't a worklet crashes the app.
  const source = readFileSync('lib/sea-life.ts', 'utf8');
  const named = [...source.matchAll(/^(export )?function (\w+)\([^]*?\{\n(.*)$/gm)];
  assert.ok(named.length > 10);
  for (const match of named) assert.match(match[3], /^\s*'worklet';/, `${match[2]} is not a worklet`);
  // Inner helpers too: an arrow function inside a worklet that isn't one crashes the same way.
  for (const m of source.matchAll(/const \w+ = \([^)]*\) => \{\n(.*)$/gm)) assert.match(m[1], /^\s*'worklet';/, m[0]);
  assert.doesNotMatch(source, /from '@\/|sea-life-plan/);
});
