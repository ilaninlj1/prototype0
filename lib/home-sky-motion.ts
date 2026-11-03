// What the sky draws every frame. On a phone these run on the UI thread, so every function here is a worklet and only
// calls other worklets (lib/home-sky.test.ts checks that).

export type SignState = { theta: number; vel: number; n: number; next: number };

/** The sign swings on its arm, and the wind flips it over now and then: more often the windier it is. */
export function stepSign(s: SignState, d: number, t: number, wind: number): SignState {
  'worklet';
  let { n, next } = s;
  if (t > next) {
    n += 1;
    next = t + (10 + (3.2 - 10) * wind);
  }
  const target = n * 2 * Math.PI + Math.sin(t * (1.2 + wind * 3)) * (0.08 + wind * 0.32);
  const vel = s.vel + (target - s.theta) * 14 * d - s.vel * 5.2 * d;
  return { theta: s.theta + vel * d, vel, n, next };
}

/** Which side shows: it changes at the first edge-on moment of each spin. */
export function signFace(theta: number): number {
  'worklet';
  return Math.floor((theta - Math.PI / 2) / (2 * Math.PI)) + 1;
}

/** The windsock, streaming left. Limp, it hangs by its pole. Full, it stands straight out and flaps at the far end. */
export function sockPaths(px: number, py: number, wind: number, t: number): { red: string; white: string } {
  'worklet';
  const w = wind < 0 ? 0 : wind > 1 ? 1 : wind;
  const ang = 1.12 + (0.05 - 1.12) * Math.pow(w, 0.7);
  const flap = t * (3 + w * 11);
  const amp = (1.2 + (3.6 - 1.2) * w) * (w > 0.08 ? 1 : 0.4);
  const rings: { x: number; y: number; nx: number; ny: number; r: number }[] = [];
  for (let i = 0; i <= 5; i++) {
    const s = i / 5;
    const bend = ang + 0.34 * (1 - w) * s;
    const nx = Math.sin(bend);
    const ny = Math.cos(bend);
    const wave = Math.sin(flap - s * 5) * amp * s;
    rings.push({ x: px - 37 * s * Math.cos(bend) + nx * wave, y: py + 37 * s * Math.sin(bend) + ny * wave, nx, ny, r: 7.2 + (3.1 - 7.2) * s });
  }
  let red = '';
  let white = '';
  for (let i = 0; i < 5; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    const d = `M${(a.x + a.nx * a.r).toFixed(1)} ${(a.y + a.ny * a.r).toFixed(1)}L${(b.x + b.nx * b.r).toFixed(1)} ${(b.y + b.ny * b.r).toFixed(1)}L${(b.x - b.nx * b.r).toFixed(1)} ${(b.y - b.ny * b.r).toFixed(1)}L${(a.x - a.nx * a.r).toFixed(1)} ${(a.y - a.ny * a.r).toFixed(1)}Z`;
    if (i % 2) white += d;
    else red += d;
  }
  return { red, white };
}

/** The swell between the far water and the near wave. */
export function swellPath(width: number, t: number, base: number, closeTo: number): string {
  'worklet';
  let d = '';
  for (let x = -8; x <= width + 8; x += 8) {
    const y = base + 2 * Math.sin(x * 0.018 + t * 0.5) + 1.2 * Math.sin(x * 0.041 - t * 0.33);
    d += `${x === -8 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
  }
  return closeTo > 0 ? `${d}L${width + 8} ${closeTo}L-8 ${closeTo}Z` : d;
}

/** Fine lines on the far water that close up toward the horizon, which is most of what makes it read as far away. */
export function ripplesPath(width: number, t: number, top: number, reach: number): string {
  'worklet';
  let d = '';
  for (let i = 0; i < 34; i++) {
    const r = (Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
    const u = Math.abs(r);
    const v = Math.abs((Math.sin((i + 1) * 78.233) * 12345.678) % 1);
    const f = u * u;
    const len = 2 + f * 13 + v * 4;
    const x = (((v * width - t * (1 + f * 5) * (0.4 + u)) % width) + width) % width;
    const y = top + 1 + f * reach;
    d += `M${(x - len).toFixed(1)} ${y.toFixed(1)}L${(x + len).toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** The sun's or the moon's path on the water: dashes that widen as they come toward you. */
export function glitterPath(x: number, top: number, height: number, t: number): string {
  'worklet';
  let d = '';
  for (let i = 0; i < 44; i++) {
    const f = i / 44;
    const y = top + 1.5 + f * f * (height - 3);
    const spread = 3 + f * f * 62;
    const cx = x + Math.sin(i * 12.9 + t * (0.6 + (i % 5) * 0.2)) * spread;
    const len = (1.5 + f * f * 12 + Math.sin(t * 2 + i) * f * 2) / 2;
    d += `M${(cx - len).toFixed(1)} ${y.toFixed(1)}L${(cx + len).toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export function rainPath(width: number, height: number, t: number, rain: number, wind: number): string {
  'worklet';
  const n = Math.round(46 * rain);
  const lean = 4 + wind * 14;
  let d = '';
  for (let i = 0; i < n; i++) {
    const speed = 0.45 + ((i * 37) % 10) / 22;
    const y = (i * 97 + t * 520 * speed) % (height + 20);
    const raw = (i * 53.7 - t * 60 * wind - (y / height) * lean * 6) % (width + 30);
    const x = raw < 0 ? raw + width + 30 : raw;
    d += `M${x.toFixed(1)} ${y.toFixed(1)}L${(x - lean * 0.5).toFixed(1)} ${(y + 12).toFixed(1)}`;
  }
  return d;
}

/** Three gulls crossing above the water, flapping in time with the song. */
export function gullsPath(width: number, t: number, y0: number, tempo: number): string {
  'worklet';
  const span = width + 180;
  const x0 = ((-t * 14) % span + span) % span - 60;
  const flap = (t * tempo * Math.PI) / 60;
  let d = '';
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.15;
    const x = x0 + i * 26;
    const y = y0 + (i === 1 ? -14 : i === 2 ? 8 : 0) + Math.sin(t * 0.6 + i) * 4;
    const f = 4 * s * (0.55 + 0.45 * Math.sin(flap + i * 1.2));
    const w = 9 * s;
    d += `M${(x - w).toFixed(1)} ${(y - f).toFixed(1)}Q${(x - w * 0.4).toFixed(1)} ${(y - f * 0.2).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}Q${(x + w * 0.4).toFixed(1)} ${(y - f * 0.2).toFixed(1)} ${(x + w).toFixed(1)} ${(y - f).toFixed(1)}`;
  }
  return d;
}

/** A lightning bolt that stays the same shape for one strike. */
export function boltPath(seed: number, x0: number, y0: number, y1: number): string {
  'worklet';
  let x = x0;
  let y = y0;
  let d = `M${x} ${y}`;
  let i = 1;
  while (y < y1) {
    const a = Math.abs((Math.sin((seed + i) * 12.9898) * 43758.5453) % 1);
    const b = Math.abs((Math.sin((seed + i) * 78.233) * 12345.678) % 1);
    y += 26 + a * 22;
    x += (b - 0.5) * 44;
    d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    i += 1;
  }
  return d;
}

export function mixVector(a: number[], b: number[], t: number): number[] {
  'worklet';
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) out.push(a[i] + (b[i] - a[i]) * t);
  return out;
}
