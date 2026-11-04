import assert from 'node:assert/strict';
import { test } from 'node:test';

import { placeParticle, recipeFor, type PrintRecipe } from './print-recipe.ts';
import { cardBounds, densityOf, HELD, LOOSE, newCard, newMarbles, stepMarbles, STRIDE, trackCard, type MarbleEnv } from './marbles.ts';
import type { SoundFeatures } from './sound.ts';

const s: SoundFeatures = {
  tempo: 120, key: 4, mode: 1, energy: 0.9, danceability: 0.5, acousticness: 0.01, instrumentalness: 0,
  speechiness: 0.04, liveness: 0.1, valence: 0.5, loudness: -6,
};
const SIDE = 360; // a 360 × 560 card with its print square across the middle
const BOUNDS = cardBounds(360, 560, SIDE, 0, 100, 2);
const loud = recipeFor(7, { ...s, energy: 0.9 }, null);
const calm = recipeFor(7, { ...s, energy: 0.25 }, null);
const FRAME = 1 / 60;

type Motion = (t: number) => [number, number];
const still: Motion = () => [0, 0];
/** The card let go 150px right and springing home the way Reanimated's default spring does (critically damped, ω 15). */
const snapBack: Motion = (t) => [150 * (1 + 15 * t) * Math.exp(-15 * t), 0];
const wiggle = (until: number): Motion => (t) => [t < until ? 80 * Math.sin(2 * Math.PI * 3 * t) : 0, 0];
/** An ordinary drag: eased out to 120px, held, let go. */
const dragAndLetGo: Motion = (t) => {
  if (t < 0.35) { const u = t / 0.35; return [120 * u * u * (3 - 2 * u), 0]; }
  if (t < 0.55) return [120, 0];
  const r = t - 0.55;
  return [120 * (1 + 15 * r) * Math.exp(-15 * r), 0];
};

function run(r: PrintRecipe, seconds: number, motion: Motion, opts: { locked?: boolean; playing?: boolean; kickAt?: number } = {}) {
  const card = newCard();
  const env: MarbleEnv = {
    t: 0, dt: FRAME, playing: opts.playing ?? false, gather: 0.5, scatter: 0, fall: 0, card,
    density: densityOf(r), bounds: BOUNDS, locked: opts.locked ?? false, kick: 0,
  };
  const state = newMarbles(r, env);
  const frames: { t: number; clock: number; hit: number; moved: boolean; state: number[] }[] = [];
  for (let f = 0; f * FRAME < seconds; f++) {
    const t = f * FRAME;
    const [x, y] = motion(t);
    trackCard(card, x / SIDE, y / SIDE, FRAME);
    env.t = env.playing ? t : 0; // the song's clock stands still while paused
    env.kick = opts.kickAt !== undefined && Math.abs(t - opts.kickAt) < FRAME / 2 ? 1 : 0;
    const out = stepMarbles(state, r, env);
    frames.push({ t, clock: env.t, hit: out.hit, moved: out.moved, state: [...state] });
  }
  return { frames, state, env };
}
/** Mean offset of the held particles from their place in the print. */
function meanOffset(r: PrintRecipe, state: number[], env: MarbleEnv): [number, number] {
  let x = 0, y = 0, n = 0;
  for (let i = 0; i * STRIDE < state.length; i++) {
    if (state[i * STRIDE + 4] === LOOSE) continue;
    const [tx, ty] = placeParticle(r, i, env.t, env.gather, env.scatter, env.fall);
    x += state[i * STRIDE + 6] - tx;
    y += state[i * STRIDE + 7] - ty;
    n++;
  }
  return [x / n, y / n];
}
const looseShare = (state: number[]) => {
  let loose = 0;
  for (let i = 4; i < state.length; i += STRIDE) if (state[i] === LOOSE) loose++;
  return loose / (state.length / STRIDE);
};

test('loud songs are marbles, calm ones balloons, songs with no sound data light marbles', () => {
  assert.ok(densityOf(loud) > 0.8);
  assert.ok(densityOf(recipeFor(7, { ...s, energy: 0.6 }, null)) > 0.3);
  assert.ok(densityOf(recipeFor(7, { ...s, energy: 0.6 }, null)) < densityOf(loud));
  assert.ok(densityOf(calm) < 0);
  assert.ok(densityOf(recipeFor(7, { ...s, energy: 0.49 }, null)) < 0, 'just under the middle floats');
  assert.equal(densityOf(recipeFor(7, null, { hue: 20, neutral: false })), 0.4);
});

test('the card tracker reads acceleration and ignores a jump', () => {
  const c = newCard();
  for (let f = 0; f < 60; f++) trackCard(c, f * 0.02, 0, FRAME);
  assert.ok(Math.abs(c[4]) < 0.5, `steady drag reads no acceleration (${c[4]})`);
  const d = newCard();
  for (let f = 0; f < 60; f++) trackCard(d, 0.5 * 20 * (f * FRAME) ** 2, 0, FRAME);
  assert.ok(Math.abs(d[4] - 20) < 3, `a steady push reads its acceleration (${d[4]})`);
  trackCard(d, 50, 0, FRAME);
  assert.ok(Math.abs(d[4]) < 25 && d[6] < 1, 'a jump of the whole card is not a jolt');
  const w = newCard();
  for (let f = 0; f < 90; f++) trackCard(w, (40 * Math.sin(2 * Math.PI * 3 * f * FRAME)) / SIDE, 0, FRAME);
  assert.ok(w[6] > 4, `a wiggle builds agitation (${w[6]})`);
  const fling = newCard();
  for (let f = 0; f < 30; f++) trackCard(fling, (-600 * Math.min(1, (f * FRAME) / 0.25) ** 2) / SIDE, 0, FRAME);
  assert.ok(fling[6] < 0.5, `a fling doesn't (${fling[6]})`);
});

test('at rest, marbles sit a touch low and balloons a touch high, and redrawing stops', () => {
  for (const [r, sign] of [[loud, 1], [calm, -1]] as const) {
    const { frames, state, env } = run(r, 3, still);
    const [, dy] = meanOffset(r, state, env);
    assert.ok(sign * dy > 0.002 && Math.abs(dy) < 0.04, `rest offset ${dy}`);
    assert.equal(looseShare(state), 0);
    assert.equal(frames.at(-1)!.moved, false, 'nothing left to draw');
  }
});

test('moving the card swings marbles against the push and balloons into it', () => {
  const push: Motion = (t) => [0.5 * 40 * SIDE * t * t, 0]; // 40 print widths a second², to the right
  const marble = run(loud, 0.25, push);
  const balloon = run(calm, 0.25, push);
  assert.ok(meanOffset(loud, marble.state, marble.env)[0] < -0.02, 'marbles lag behind');
  assert.ok(meanOffset(calm, balloon.state, balloon.env)[0] > 0.01, 'balloons lean in');
});

test('a snap-back swings them without shaking anything loose, then they settle', () => {
  for (const r of [loud, calm]) {
    const { frames, state, env } = run(r, 2.5, snapBack);
    const peak = Math.max(...frames.map((f) => Math.abs(meanOffset(r, f.state, { ...env, t: f.clock })[0])));
    assert.ok(peak > 0.02, `visible swing (${peak})`);
    assert.ok(frames.every((f) => looseShare(f.state) === 0), 'nothing comes loose');
    const [dx] = meanOffset(r, state, env);
    assert.ok(Math.abs(dx) < 0.004, `settled (${dx})`);
  }
});

test('marbles overshoot and jiggle; balloons lean one way, then the other as the card stops, and ease', () => {
  const crossings = (r: PrintRecipe) => {
    const { frames, env } = run(r, 2, snapBack);
    const xs = frames.slice(6).map((f) => meanOffset(r, f.state, { ...env, t: f.clock })[0]).filter((x) => Math.abs(x) > 0.002);
    let n = 0;
    for (let i = 1; i < xs.length; i++) if (Math.sign(xs[i]) !== Math.sign(xs[i - 1])) n++;
    return n;
  };
  assert.ok(crossings(loud) >= 3, `marbles jiggle (${crossings(loud)})`);
  assert.ok(crossings(calm) <= 1, `balloons ease (${crossings(calm)})`);
});

test('an ordinary drag and let-go shakes nothing loose', () => {
  for (const r of [loud, calm]) assert.ok(run(r, 2, dragAndLetGo).frames.every((f) => looseShare(f.state) === 0));
});

test('a hard wiggle shakes marbles loose; held still, every one flies back into the print', () => {
  const shaken = run(loud, 1.5, wiggle(1.5));
  assert.ok(looseShare(shaken.state) > 0.3, `loose after the wiggle: ${looseShare(shaken.state)}`);
  const after = run(loud, 6, wiggle(1.5));
  assert.equal(looseShare(after.state), 0);
  const [dx, dy] = meanOffset(loud, after.state, after.env);
  assert.ok(Math.hypot(dx, dy) < 0.03, `back in the print (${dx}, ${dy})`);
});

test('loose marbles drop to the bottom and loose balloons rise to the top', () => {
  const at = (r: PrintRecipe) => {
    const { frames } = run(r, 2.1, wiggle(1.5));
    const f = frames.at(-1)!.state;
    let y = 0, n = 0;
    for (let i = 0; i * STRIDE < f.length; i++) if (f[i * STRIDE + 4] === LOOSE) { y += f[i * STRIDE + 7]; n++; }
    return n ? y / n : NaN;
  };
  assert.ok(at(loud) > 1.05, `marbles near the floor: ${at(loud)}`);
  assert.ok(at(calm) < 0, `balloons near the ceiling: ${at(calm)}`);
});

test('loose marbles hitting an edge report a hit for the haptic; balloons stay quiet', () => {
  assert.ok(Math.max(...run(loud, 2, wiggle(1.5)).frames.map((f) => f.hit)) > 0.6);
  assert.equal(Math.max(...run(calm, 2, wiggle(1.5)).frames.map((f) => f.hit)), 0);
});

test('once revealed nothing comes loose', () => {
  const { frames } = run(loud, 1.5, wiggle(1.5), { locked: true });
  assert.ok(frames.every((f) => looseShare(f.state) === 0));
});

test('nothing ever leaves the card, even thrown around with frame hitches', () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const card = newCard();
  const env: MarbleEnv = { t: 0, dt: FRAME, playing: true, gather: 0, scatter: 0, fall: 0, card, density: densityOf(loud), bounds: BOUNDS, locked: false, kick: 0 };
  const state = newMarbles(loud, env);
  let x = 0, y = 0;
  for (let f = 0; f < 600; f++) {
    env.dt = f % 97 === 0 ? 0.25 : FRAME;
    env.t += env.dt;
    x += rand() * 120;
    y += rand() * 120;
    env.fall = f > 400 ? 1 : 0;
    env.scatter = f > 300 && f < 400 ? 1 : 0;
    trackCard(card, x / SIDE, y / SIDE, env.dt);
    stepMarbles(state, loud, env);
    for (let i = 0; i * STRIDE < state.length; i++) {
      const px = state[i * STRIDE + 6], py = state[i * STRIDE + 7];
      assert.ok(Number.isFinite(px) && Number.isFinite(py));
      assert.ok(px >= BOUNDS[0] - 1e-9 && px <= BOUNDS[2] + 1e-9 && py >= BOUNDS[1] - 1e-9 && py <= BOUNDS[3] + 1e-9, `frame ${f} particle ${i} at ${px}, ${py}`);
    }
  }
});

test('a save pops them outward', () => {
  const { frames } = run(loud, 1, still, { kickAt: 0.5 });
  const spread = (st: number[]) => {
    let d = 0;
    for (let i = 0; i * STRIDE < st.length; i++) d += Math.hypot(st[i * STRIDE + 6] - 0.5, st[i * STRIDE + 7] - 0.5);
    return d;
  };
  const before = spread(frames.find((f) => f.t >= 0.48)!.state);
  const after = Math.max(...frames.filter((f) => f.t > 0.5 && f.t < 0.7).map((f) => spread(f.state)));
  assert.ok(after > before * 1.03, `${before} → ${after}`);
  assert.equal(frames.find((f) => f.t > 0.5)!.state.filter((_, i) => i % STRIDE === 4 && _ !== HELD).length, 0, 'a pop keeps them held');
});
