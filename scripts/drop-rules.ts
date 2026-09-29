// scripts/drop-rules.ts
import type { Slot } from '../lib/daily-drop.ts';

export const SLOTS: Slot[] = ['famous', 'buried', 'tiny', 'known', 'radar'];

export function slotFor(listeners: number): Slot {
  if (listeners < 5_000) return 'buried';
  if (listeners < 20_000) return 'tiny';
  if (listeners < 100_000) return 'radar';
  if (listeners < 1_000_000) return 'known';
  return 'famous';
}

export function inRankWindow(slot: Slot, rank: number): boolean {
  return slot === 'famous' ? rank >= 11 && rank <= 50 : rank >= 1 && rank <= 3;
}

const toUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));

export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function canRedo(day: string, today: string): boolean {
  return day > today;
}

/**
 * Which September seed counts to *try* for a slot. Wider than the slot
 * itself: counts drift, and the slot is decided by the fresh count, so a
 * too-narrow seed window starves `known` (only ~58 seeds fall in 100K–1M).
 */
export function seedWindow(slot: Slot): { min: number; max: number } {
  switch (slot) {
    case 'buried':
      return { min: 0, max: 6_000 };
    case 'tiny':
      return { min: 4_000, max: 25_000 };
    case 'radar':
      return { min: 15_000, max: 120_000 };
    case 'known':
      return { min: 60_000, max: 1_500_000 };
    case 'famous':
      return { min: 800_000, max: Infinity };
  }
}

export function distinctGenres(songs: { genre: string }[]): boolean {
  return new Set(songs.map((s) => s.genre)).size === songs.length;
}
