// How creatures move. A pose is a pure function of time, so the canvas (a worklet) and the tap test (JS) agree without
// sharing any state. Only motion here: nothing about how a creature looks.

export type Mover = { seed: number; speed: number; scale: number; band: number; x: number; look: string };
export type Pose = { x: number; y: number; dir: 1 | -1; tail: number; tilt: number };

const WRAP = 90;
/** The water column creatures keep to: clear of the pill at the top, above the seabed at the bottom. */
const TOP = 0.16;
const BOTTOM = 0.74;

function unit(seed: number, salt: number): number {
  'worklet';
  const v = Math.sin((seed + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

export function floorY(h: number): number {
  'worklet';
  return h * 0.86;
}

export function swimPose(m: Mover, t: number, w: number, h: number): Pose {
  'worklet';
  const phase = unit(m.seed, 1) * 6.283;
  if (m.look === 'crab' || m.look === 'starfish') {
    const shuffle = m.look === 'crab' ? Math.sin(t * 0.35 + phase) * 26 : 0;
    return { x: m.x * w + shuffle, y: floorY(h) - 2, dir: Math.cos(t * 0.35 + phase) >= 0 ? 1 : -1, tail: 0, tilt: 0 };
  }
  const y0 = (TOP + (BOTTOM - TOP) * Math.max(0, Math.min(1, m.band))) * h;
  if (m.look === 'jelly') {
    const pulse = Math.sin(t * 1.3 + phase);
    return {
      x: m.x * w + Math.sin(t * 0.14 + phase) * w * 0.12,
      y: y0 + Math.sin(t * 0.32 + phase) * 26 - pulse * 6,
      dir: 1,
      tail: pulse,
      tilt: Math.sin(t * 0.21 + phase) * 0.12,
    };
  }
  const span = w + WRAP * 2;
  const speed = m.speed === 0 ? 8 : m.speed;
  const run = m.x * span + speed * t;
  const x = ((run % span) + span) % span - WRAP;
  const bob = m.look === 'turtle' || m.look === 'whale' ? 0.45 : 0.8;
  const y = y0 + Math.sin(t * bob + phase) * (m.look === 'whale' ? 10 : 6);
  const beats = m.look === 'turtle' ? 2.2 : m.look === 'whale' ? 1.4 : 9;
  return { x, y, dir: speed >= 0 ? 1 : -1, tail: Math.sin(t * beats + phase), tilt: Math.cos(t * bob + phase) * 0.06 * (speed >= 0 ? 1 : -1) };
}

/** Where a sleeper rests: spread across the seabed in slots, never a pile. */
export function restPose(seed: number, i: number, n: number, w: number, floor: number): { x: number; y: number } {
  'worklet';
  const slot = (i + 0.5) / Math.max(1, n);
  const jitter = (unit(seed, 2) - 0.5) * (0.5 / Math.max(1, n));
  return { x: (slot + jitter) * w, y: floor - 4 - unit(seed, 3) * 9 };
}

export function schoolOffset(i: number): [number, number] {
  'worklet';
  const dx = [0, -15, -11, -26, -22, -34, -38, -46];
  const dy = [0, -7, 8, 2, -13, 9, -5, 4];
  const k = i % dx.length;
  const lap = Math.floor(i / dx.length);
  return [dx[k] - lap * 18, dy[k] + lap * 3];
}

/** How far a point is pushed away from something passing: smooth to nothing at r. */
export function scatter(px: number, py: number, fromX: number, fromY: number, r: number): [number, number] {
  'worklet';
  const dx = px - fromX;
  const dy = py - fromY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= r) return [0, 0];
  const force = 1 - d / r;
  const push = force * force * r * 0.55;
  if (d < 0.001) return [push, 0];
  return [(dx / d) * push, (dy / d) * push];
}
