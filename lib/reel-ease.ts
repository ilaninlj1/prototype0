// The easing curves of claude-motion-reel.html, as worklets so Skia scenes can
// use them on the UI thread. prog(t, a, b) is the reel's p(): how far t is
// through the window a → b, clamped to 0–1. Pure.

export function clamp01(x: number): number {
  'worklet';
  return Math.min(1, Math.max(0, x));
}
export function prog(t: number, a: number, b: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}
export function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}
export function expoOut(x: number): number {
  'worklet';
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}
export function expoIn(x: number): number {
  'worklet';
  return x <= 0 ? 0 : Math.pow(2, 10 * x - 10);
}
export function expoInOut(x: number): number {
  'worklet';
  return x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
}
export function quintOut(x: number): number {
  'worklet';
  return 1 - Math.pow(1 - x, 5);
}
export function quintIn(x: number): number {
  'worklet';
  return x * x * x * x * x;
}
export function quintInOut(x: number): number {
  'worklet';
  return x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2;
}
export function backOut(x: number): number {
  'worklet';
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
