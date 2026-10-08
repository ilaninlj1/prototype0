export const MIX_START_THRESHOLD = 0.1;
export const MIX_THROTTLE_STEP = 0.03;
export const MIX_CANCEL_MS = 200;

export function mixVolumes(mix: number): { current: number; next: number } {
  const m = Math.max(0, Math.min(1, mix));
  if (m === 0) return { current: 1, next: 0 };
  if (m === 1) return { current: 0, next: 1 };
  return { current: Math.cos(m * Math.PI / 2), next: Math.sin(m * Math.PI / 2) };
}

export function mixForDrag(translationX: number, translationY: number, threshold: number): number {
  'worklet';
  if (translationX >= 0 || translationY > Math.abs(translationX)) return 0;
  return Math.max(0, Math.min(1, -translationX / threshold));
}

export function shouldReportMix(mix: number, previous: number): boolean {
  'worklet';
  return Math.abs(mix - previous) + Number.EPSILON >= MIX_THROTTLE_STEP;
}
