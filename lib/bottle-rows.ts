// Bottles' shapes, and the guard every row from the server passes through. Rows come from
// strangers' phones by way of supabase/bottles.sql, so nothing is trusted: bad rows are
// dropped, long strings cut, out-of-range numbers refused. Pure.

import type { Tier } from './taste-distance.ts';

export type { Tier };

/** Three numbers from the keeper's previous save: the ring they add to the bottle's print. */
export type RingSeed = { key: number | null; mode: 0 | 1 | null; energy: number; tempo: number };

/** Where a phone is, as far as Bottles ever knows: a city (or a time-zone region) and 0.5° coordinates. */
export type Place = { city: string; country: string; lat: number; lng: number; exact: boolean };

export type Hop = {
  kind: 'launch' | 'keep';
  city: string;
  country: string;
  lat: number;
  lng: number;
  exact: boolean;
  tier: Tier | null;
  ring: RingSeed | null;
  at: string;
};

export type BottleState = 'floating' | 'sunk' | 'retired';

export type Bottle = {
  id: string;
  trackId: number;
  artistKey: string;
  genreTag: string;
  keeps: number;
  passes: number;
  state: BottleState;
  lastMovedAt: string;
  changedAt: string;
  hops: Hop[];
};

export type Verdict = 'keep' | 'pass' | 'known' | 'unplayable';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set<BottleState>(['floating', 'sunk', 'retired']);
const TIERS = new Set<Tier>(['close', 'new', 'deep']);
const MAX_HOPS = 500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const count = (v: unknown): number => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : 0;
};
// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');

function parseRing(v: unknown): RingSeed | null {
  if (!isObj(v)) return null;
  const energy = num(v.energy);
  const tempo = num(v.tempo);
  if (energy === null || energy < 0 || energy > 1 || tempo === null || tempo < 30 || tempo > 250) return null;
  const key = v.key === null || v.key === undefined ? null : num(v.key);
  if (key !== null && !(Number.isInteger(key) && key >= 0 && key <= 11)) return null;
  if (v.key !== null && v.key !== undefined && key === null) return null;
  const mode = v.mode === null || v.mode === undefined ? null : v.mode === 0 || v.mode === 1 ? v.mode : undefined;
  if (mode === undefined) return null;
  return { key, mode, energy, tempo };
}

function parseHop(v: unknown): Hop | null {
  if (!isObj(v) || (v.kind !== 'launch' && v.kind !== 'keep')) return null;
  const lat = num(v.lat);
  const lng = num(v.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const city = clean(v.city, 80);
  if (!city) return null;
  return {
    kind: v.kind,
    city,
    country: clean(v.country, 80),
    lat,
    lng,
    exact: v.exact !== false,
    tier: TIERS.has(v.tier as Tier) ? (v.tier as Tier) : null,
    ring: parseRing(v.ring),
    at: clean(v.at, 40),
  };
}

export function parseBottle(row: unknown): Bottle | null {
  if (!isObj(row)) return null;
  const trackId = num(row.track_id);
  if (typeof row.id !== 'string' || !UUID.test(row.id)) return null;
  if (trackId === null || !Number.isInteger(trackId) || trackId <= 0) return null;
  if (!STATES.has(row.state as BottleState)) return null;
  const hops = Array.isArray(row.hops) ? row.hops.slice(0, MAX_HOPS).map(parseHop).filter((h): h is Hop => h !== null) : [];
  return {
    id: row.id,
    trackId,
    artistKey: clean(row.artist_key, 120),
    genreTag: clean(row.genre_tag, 60),
    keeps: count(row.keeps),
    passes: count(row.passes),
    state: row.state as BottleState,
    lastMovedAt: clean(row.last_moved_at, 40),
    changedAt: clean(row.changed_at, 40),
    hops,
  };
}

export function parseBottles(rows: unknown): Bottle[] {
  return Array.isArray(rows) ? rows.map(parseBottle).filter((b): b is Bottle => b !== null) : [];
}
