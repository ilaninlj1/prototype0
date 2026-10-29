// Where a bottle says you are. With location: the city the phone's own geocoder names, and
// coordinates rounded to 0.5° (about 55 km) before anything leaves the phone. Without it: a
// region from the time zone, never the zone's city (Dallas phones say America/Chicago). Pure.

import type { Place } from './bottle-rows.ts';

export const ROUND_DEG = 0.5;

/**
 * Your city goes on a bottle only when you said "Use my city" (or are answering that card now). Location
 * allowed for Run mode is not a yes for Bottles.
 */
export function mayUseCity(i: { cityOk: boolean; asking: boolean }): boolean {
  return i.cityOk || i.asking;
}

export function roundCoord(x: number): number {
  return Math.round(x / ROUND_DEG) * ROUND_DEG + 0; // + 0 turns -0 into 0
}

type Geocode = { city?: string | null; subregion?: string | null; region?: string | null; country?: string | null };

export function placeFromGeocode(g: Geocode, lat: number, lng: number): Place | null {
  const name = [g.city, g.subregion, g.region].map((s) => s?.trim()).find((s) => s);
  const country = g.country?.trim();
  if (!name || !country || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { city: name.slice(0, 80), country: country.slice(0, 80), lat: roundCoord(lat), lng: roundCoord(lng), exact: true };
}

type Region = { label: string; country: string; lat: number; lng: number };

const ZONES: Record<string, Region> = {
  'America/New_York': { label: 'Eastern US', country: 'United States', lat: 38, lng: -78 },
  'America/Detroit': { label: 'Eastern US', country: 'United States', lat: 38, lng: -78 },
  'America/Chicago': { label: 'Central US', country: 'United States', lat: 35, lng: -95 },
  'America/Denver': { label: 'Mountain US', country: 'United States', lat: 40, lng: -106 },
  'America/Phoenix': { label: 'Arizona', country: 'United States', lat: 34, lng: -112 },
  'America/Los_Angeles': { label: 'Pacific US', country: 'United States', lat: 38, lng: -121 },
  'America/Anchorage': { label: 'Alaska', country: 'United States', lat: 61, lng: -150 },
  'Pacific/Honolulu': { label: 'Hawaii', country: 'United States', lat: 21, lng: -157.5 },
  'America/Mexico_City': { label: 'Mexico', country: 'Mexico', lat: 19.5, lng: -99 },
  'Africa/Johannesburg': { label: 'South Africa', country: 'South Africa', lat: -26, lng: 28 },
};

const PREFIXES: Record<string, Region> = {
  Europe: { label: 'Europe', country: '', lat: 50, lng: 10 },
  Asia: { label: 'Asia', country: '', lat: 30, lng: 100 },
  Africa: { label: 'Africa', country: '', lat: 5, lng: 20 },
  America: { label: 'the Americas', country: '', lat: 15, lng: -80 },
  Australia: { label: 'Australia', country: 'Australia', lat: -25, lng: 135 },
  Pacific: { label: 'the Pacific', country: '', lat: -10, lng: 170 },
};

const EARTH: Region = { label: 'Earth', country: '', lat: 0, lng: 0 };

export function placeFromTimeZone(tz: string): Place {
  const r = ZONES[tz] ?? PREFIXES[tz.split('/')[0]] ?? EARTH;
  return { city: r === EARTH ? 'Somewhere on Earth' : `Somewhere in ${r.label}`, country: r.country, lat: r.lat, lng: r.lng, exact: false };
}
