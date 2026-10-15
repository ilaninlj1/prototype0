// Marbles: the blind card's particles with weight. Moving the card swings them: a loud song's the
// other way, like marbles; a calm song's into the motion, like balloons (a helium balloon leans
// forward in a car that speeds up). They bounce off the card's edges. A hard wiggle shakes them
// loose to drop to the bottom (or float to the top); once the card is still they fly back into the
// print one by one. Held, each particle swings around its place in the print, so the print's own
// motion (the flow, the breathing at the song's tempo) passes through untouched.
// Units are print widths: (0, 0) is the print square's top-left corner, 1 its width.

import { particleHash, placeParticle, type PrintRecipe } from './print-recipe.ts';

/** Per particle: deviation and its velocity (held) or position and velocity (loose), mode, timer, drawn x, y, trail start x, y. */
export const STRIDE = 10;
export const HELD = 0;
export const LOOSE = 1;
export const RETURNING = 2;

const INERTIA = 0.35; // share of the card's acceleration a held particle feels
const SAG = 1.2; // a held marble's pull down (a balloon's up), times its density
const G_FREE = 9; // a loose marble's fall
const BUOY = 4; // a loose balloon's rise
const LEAN_FREE = 0.6; // a loose balloon leans this much into the card's acceleration
const BALLOON_DRAG = 2.5; // per second
const FRICTION = 5; // per second, along the edge a loose particle rests on
const KICK = 0.9; // a save's outward pop, print widths a second
const A_LOOSE = 6; // agitation (see trackCard) that starts shaking the heaviest loose
const A_CALM = 1; // below this, and slow, the card counts as still
const SLOW = 0.5; // print widths a second
const CALM_WAIT = 0.5; // seconds still before loose ones start home
const RETURN_TIME = 0.9; // seconds of the softer spring that brings one home
const TRAIL = 0.1; // seconds of motion a stroke shows, as in live-print-canvas
const MAX_STREAK = 0.1;
const REST = 0.25; // an edge hit slower than this stops the particle instead of bouncing it (gravity alone adds 0.15 a frame)
const MOVED = 1e-4;

const SMOOTH = 0.035; // seconds: touch updates land between frames, so the card's motion is smoothed before it's differentiated
const A_MAX = 150;
const JUMP = 1; // a move this far in one frame is the card being replaced, not moved
const AGITATION = 0.45; // seconds a wiggle's reversals take to fade
const FLIP = 0.5; // a reversal slower than this (print widths a second) is just a hand settling

export type MarbleEnv = {
  /** The song's clock, seconds. */
  t: number;
  dt: number;
  playing: boolean;
  gather: number;
  scatter: number;
  fall: number;
  /** From trackCard. */
  card: number[];
  /** From densityOf. */
  density: number;
  /** The card's edges in print units: x0, y0, x1, y1 (cardBounds). */
  bounds: [number, number, number, number];
  /** Revealed: nothing comes loose and loose ones head home. */
  locked: boolean;
  /** A save's pop this frame, 0 otherwise. */
  kick: number;
};

/**
 * How heavy a song's particles are: marbles from 0.35 to 1 at energy 0.5 and up (about three songs
 * in four), balloons from -0.3 to -0.7 below. Songs with no sound data are light marbles.
 */
export function densityOf(r: PrintRecipe): number {
  if (r.source !== 'sound') return 0.4;
  const energy = Math.min(1, Math.max(0, (r.particles - 80) / 160)); // recipeFor sets particles to 80 + 160 × energy
  return energy >= 0.5 ? 0.35 + 1.3 * (energy - 0.5) : -(0.3 + 0.8 * (0.5 - energy));
}

/** The card's edges in print units, for a print square of `side` px at (left, top) in a width × height card, kept `margin` px in. */
export function cardBounds(width: number, height: number, side: number, left: number, top: number, margin: number): [number, number, number, number] {
  return [(margin - left) / side, (margin - top) / side, (width - left - margin) / side, (height - top - margin) / side];
}

/**
 * The card's motion: x, y, velocity, acceleration (smoothed), agitation, a primed flag and the
 * fastest it's gone each way since it last turned around. Agitation adds up the speed of every
 * reversal and fades: a wiggle builds it, while one drag, a fling or a snap-back never turns around.
 */
export function newCard(): number[] {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

/** Follows the card's offset (in print units) frame by frame. */
export function trackCard(c: number[], x: number, y: number, dt: number): void {
  'worklet';
  if (c[7] === 0 || dt <= 0 || Math.abs(x - c[0]) > JUMP || Math.abs(y - c[1]) > JUMP) {
    c[0] = x;
    c[1] = y;
    c[2] = 0;
    c[3] = 0;
    c[4] = 0;
    c[5] = 0;
    c[7] = 1;
    c[8] = 0;
    c[9] = 0;
    return;
  }
  const k = 1 - Math.exp(-dt / SMOOTH);
  const vx = c[2] + ((x - c[0]) / dt - c[2]) * k;
  const vy = c[3] + ((y - c[1]) / dt - c[3]) * k;
  const ax = Math.max(-A_MAX, Math.min(A_MAX, (vx - c[2]) / dt));
  const ay = Math.max(-A_MAX, Math.min(A_MAX, (vy - c[3]) / dt));
  c[4] += (ax - c[4]) * k;
  c[5] += (ay - c[5]) * k;
  c[6] *= Math.exp(-dt / AGITATION);
  for (let axis = 0; axis < 2; axis++) {
    const v = axis === 0 ? vx : vy;
    const peak = c[8 + axis];
    if (Math.sign(v) !== 0 && Math.sign(peak) !== 0 && Math.sign(v) !== Math.sign(peak)) {
      if (Math.abs(peak) > FLIP) c[6] += Math.abs(peak);
      c[8 + axis] = v;
    } else if (Math.abs(v) > Math.abs(peak)) c[8 + axis] = v;
  }
  c[0] = x;
  c[1] = y;
  c[2] = vx;
  c[3] = vy;
}

/** Every particle held at its place in the print. */
export function newMarbles(r: PrintRecipe, env: MarbleEnv): number[] {
  'worklet';
  const s: number[] = [];
  for (let i = 0; i < r.particles; i++) {
    const [x, y] = placeParticle(r, i, env.t, env.gather, env.scatter, env.fall);
    s.push(0, 0, 0, 0, HELD, 0, x, y, x, y);
  }
  return s;
}

/** How fast a particle's place in the print is moving, from the song's clock alone. */
function homeVelocity(r: PrintRecipe, i: number, env: MarbleEnv): [number, number] {
  'worklet';
  if (!env.playing) return [0, 0];
  const e = 1 / 120;
  const [ax, ay] = placeParticle(r, i, env.t - e, env.gather, env.scatter, env.fall);
  const [bx, by] = placeParticle(r, i, env.t, env.gather, env.scatter, env.fall);
  return [(bx - ax) / e, (by - ay) / e];
}

/**
 * One frame. Returns the hardest a marble hit an edge (print widths a second, for the haptic; balloons
 * never count) and whether anything moved enough to redraw.
 */
export function stepMarbles(s: number[], r: PrintRecipe, env: MarbleEnv): { hit: number; moved: boolean } {
  'worklet';
  if (s.length !== r.particles * STRIDE) {
    const fresh = newMarbles(r, env);
    s.length = 0;
    for (let k = 0; k < fresh.length; k++) s.push(fresh[k]);
  }
  const dt = Math.min(env.dt, 1 / 30);
  const density = env.density;
  const marble = density > 0;
  const mass = Math.abs(density);
  const x0 = env.bounds[0], y0 = env.bounds[1], x1 = env.bounds[2], y1 = env.bounds[3];
  const ax = env.card[4], ay = env.card[5], agitation = env.card[6];
  const still = agitation < A_CALM && Math.hypot(env.card[2], env.card[3]) < SLOW;
  const omega = marble ? 8 + 3 * mass : 4.5;
  const zeta = marble ? 0.14 + 0.1 * (1 - mass) : 1;
  const bounce = marble ? 0.45 : 0.15;
  const trail = r.stroke === 'dash' ? TRAIL * 0.5 : TRAIL;
  const lines = r.texture !== 'grain';
  let hit = 0;
  let moved = false;

  for (let i = 0; i < r.particles; i++) {
    const o = i * STRIDE;
    const h = particleHash(i, r.seed);
    const h2 = (h * 7.13 + 0.37) % 1;
    const [tx, ty] = placeParticle(r, i, env.t, env.gather, env.scatter, env.fall);
    const wasX = s[o + 6], wasY = s[o + 7];
    let mode = s[o + 4];

    // A hard wiggle shakes particles loose, the heavier song's first.
    if (mode !== LOOSE && !env.locked && agitation > A_LOOSE * (0.7 + 0.6 * h) * (1.4 - 0.6 * mass)) {
      const [hx, hy] = homeVelocity(r, i, env);
      s[o] = tx + s[o];
      s[o + 1] = ty + s[o + 1];
      s[o + 2] = hx + s[o + 2];
      s[o + 3] = hy + s[o + 3];
      s[o + 4] = mode = LOOSE;
      s[o + 5] = 0;
    }

    let px: number, py: number, vx: number, vy: number;
    if (mode === LOOSE) {
      vx = s[o + 2];
      vy = s[o + 3];
      if (env.kick > 0) {
        const ex = s[o] - 0.5, ey = s[o + 1] - 0.5, len = Math.hypot(ex, ey) || 1;
        vx += (ex / len) * KICK * env.kick;
        vy += (ey / len) * KICK * env.kick;
      }
      if (marble) {
        vx -= ax * dt;
        vy += (G_FREE - ay) * dt;
      } else {
        vx += (LEAN_FREE * ax - BALLOON_DRAG * vx) * dt;
        vy += (LEAN_FREE * ay - BUOY - BALLOON_DRAG * vy) * dt;
      }
      px = s[o] + vx * dt;
      py = s[o + 1] + vy * dt;
    } else {
      // Held, or on its way home: a damped spring around its place, swung by the card's motion.
      const home = mode === RETURNING;
      const w = home ? Math.min(omega, 7) : omega;
      const z = home ? Math.max(zeta, 1.05) : zeta * (0.8 + 0.4 * h2);
      const m = 0.75 + 0.5 * h;
      let ux = s[o + 2], uy = s[o + 3];
      if (env.kick > 0) {
        const ex = tx - 0.5, ey = ty - 0.5, len = Math.hypot(ex, ey) || 1;
        ux += (ex / len) * KICK * env.kick * (0.6 + 0.8 * h2);
        uy += (ey / len) * KICK * env.kick * (0.6 + 0.8 * h2);
      }
      ux += (-w * w * s[o] - 2 * z * w * ux - density * INERTIA * m * ax) * dt;
      uy += (-w * w * s[o + 1] - 2 * z * w * uy + density * (SAG - INERTIA * m * ay)) * dt;
      px = tx + s[o] + ux * dt;
      py = ty + s[o + 1] + uy * dt;
      vx = ux;
      vy = uy;
    }

    // The card's edges. Only a fresh hit counts: a particle already resting there doesn't buzz.
    if (px < x0 || px > x1) {
      const into = px < x0 ? -vx : vx;
      px = px < x0 ? x0 : x1;
      if (into > 0) {
        if (marble && wasX !== px) hit = Math.max(hit, into);
        vx = into < REST ? 0 : -vx * bounce;
      }
    }
    if (py < y0 || py > y1) {
      const into = py < y0 ? -vy : vy;
      py = py < y0 ? y0 : y1;
      if (into > 0) {
        if (marble && wasY !== py) hit = Math.max(hit, into);
        vy = into < REST ? 0 : -vy * bounce;
      }
      // Rolling along the floor (or the ceiling, for a balloon) slows down.
      if (mode === LOOSE && (marble ? py === y1 : py === y0)) vx *= Math.exp(-FRICTION * dt);
    }

    if (mode === LOOSE) {
      s[o] = px;
      s[o + 1] = py;
      s[o + 2] = vx;
      s[o + 3] = vy;
      // Still long enough (or revealed), it heads home, one after another.
      s[o + 5] = still ? s[o + 5] + dt : 0;
      if (env.locked || s[o + 5] > CALM_WAIT + 0.8 * h) {
        const [hx, hy] = homeVelocity(r, i, env);
        s[o] = px - tx;
        s[o + 1] = py - ty;
        s[o + 2] = vx - hx;
        s[o + 3] = vy - hy;
        s[o + 4] = RETURNING;
        s[o + 5] = RETURN_TIME;
      }
    } else {
      s[o] = px - tx;
      s[o + 1] = py - ty;
      s[o + 2] = vx;
      s[o + 3] = vy;
      if (mode === RETURNING) {
        s[o + 5] -= dt;
        if (s[o + 5] <= 0) s[o + 4] = HELD;
      }
    }

    // Where its stroke starts: a streak behind a loose one, its place's own trail for a held one.
    let qx = px, qy = py;
    if (lines) {
      if (s[o + 4] === LOOSE) {
        qx = px - vx * trail;
        qy = py - vy * trail;
      } else {
        const [bx, by] = placeParticle(r, i, env.t - trail, env.gather, env.scatter, env.fall);
        qx = bx + s[o] - s[o + 2] * trail;
        qy = by + s[o + 1] - s[o + 3] * trail;
      }
      const len = Math.hypot(px - qx, py - qy);
      if (len > MAX_STREAK) {
        qx = px + ((qx - px) * MAX_STREAK) / len;
        qy = py + ((qy - py) * MAX_STREAK) / len;
      }
      qx = Math.min(x1, Math.max(x0, qx));
      qy = Math.min(y1, Math.max(y0, qy));
    }
    if (Math.abs(px - wasX) > MOVED || Math.abs(py - wasY) > MOVED || Math.abs(qx - s[o + 8]) > MOVED || Math.abs(qy - s[o + 9]) > MOVED) moved = true;
    s[o + 6] = px;
    s[o + 7] = py;
    s[o + 8] = qx;
    s[o + 9] = qy;
  }
  return { hit, moved };
}
