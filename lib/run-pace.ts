import type { Fix } from './run-types.ts';

export const MILE_M = 1609.344;
export const MAX_ACCURACY_M = 25;
export const MAX_SPEED_MS = 8;

const EARTH_RADIUS_M = 6371000;
const MIN_SPAN_MS = 30000;
const MIN_DISTANCE_M = 20;

/** Great-circle distance in meters. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Windowed pace in s/km; requires 30 s and 20 m since any gap over 30 s. */
export function paceOver(fixes: Fix[], now: number, windowMs = 60000): number | null {
  const recent = fixes
    .filter(f => f.t >= now - windowMs && f.t <= now)
    .sort((a, b) => a.t - b.t);
  if (recent.length < 2) return null;

  let start = recent[0];
  let distance = 0;
  for (let i = 1; i < recent.length; i += 1) {
    const previous = recent[i - 1];
    const current = recent[i];
    if (current.t - previous.t > MIN_SPAN_MS) {
      // Old fixes must not bridge a tunnel and make pace look ready again.
      start = current;
      distance = 0;
    } else {
      distance += haversineM(previous, current);
    }
  }

  const spanMs = recent[recent.length - 1].t - start.t;
  if (spanMs < MIN_SPAN_MS || distance < MIN_DISTANCE_M) return null;
  return spanMs / distance;
}

/** Keeps accepted fixes and total distance, with a rolling minute of pace. */
export function createPaceTracker(): {
  push(f: Fix): boolean;
  pace(now: number): number | null;
  distanceM(): number;
  last(): Fix | null;
  fixes(): Fix[];
} {
  const kept: Fix[] = [];
  let distance = 0;

  return {
    push(f) {
      if (f.accuracy !== null && f.accuracy > MAX_ACCURACY_M) return false;
      const previous = kept[kept.length - 1];
      let segment = 0;
      if (previous) {
        if (f.t <= previous.t) return false;
        segment = haversineM(previous, f);
        if (segment / ((f.t - previous.t) / 1000) > MAX_SPEED_MS) return false;
      }
      kept.push({ ...f });
      distance += segment;
      return true;
    },
    pace(now) {
      return paceOver(kept, now);
    },
    distanceM() {
      return distance;
    },
    last() {
      const latest = kept[kept.length - 1];
      return latest ? { ...latest } : null;
    },
    fixes() {
      return kept.map(f => ({ ...f }));
    },
  };
}

/** Rounded min/mile as m:ss, or an em dash for unavailable pace. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm)) return '—';
  const seconds = Math.round(secPerKm * (MILE_M / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Miles to one decimal place. */
export function formatMiles(m: number): string {
  const miles = m / MILE_M;
  return `${miles < 0.05 ? '0.0' : miles.toFixed(1)} mi`;
}

/** Elapsed whole seconds as m:ss or h:mm:ss. */
export function formatClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${remainder}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}`;
}
