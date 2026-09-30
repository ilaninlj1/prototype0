import { fetch } from 'expo/fetch';
import jpeg from 'jpeg-js';

import { artworkUrl, type DiscoveryTrack } from './discovery';
import { makePrint, pickInks, type Print } from './print';

// The network side of song prints: the cover's colors (from a 6×6 thumbnail,
// under 1KB) and each song's length and release year (one batched iTunes
// lookup per feed refill). Everything is cached for the session and every
// failure falls back to a print made from what we do have.

type Facts = { durationMs: number | null; releaseYear: number | null };

const inkCache = new Map<string, Promise<[string, string] | null>>();
const factCache = new Map<number, Facts>();
const factRequests = new Map<number, Promise<void>>();

function inksFor(url: string): Promise<[string, string] | null> {
  if (!url) return Promise.resolve(null);
  let pending = inkCache.get(url);
  if (!pending) {
    pending = fetch(artworkUrl(url, 6))
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf ? pickInks(jpeg.decode(new Uint8Array(buf), { useTArray: true }).data) : null))
      .catch(() => null);
    inkCache.set(url, pending);
  }
  return pending;
}

/** One iTunes lookup for every song here we don't know the length and year of yet. */
export function prefetchFacts(tracks: DiscoveryTrack[], country: string): Promise<void> {
  const missing = tracks.filter((t) => !factCache.has(t.id) && !factRequests.has(t.id)).slice(0, 50);
  if (missing.length === 0) return Promise.all(tracks.map((t) => factRequests.get(t.id))).then(() => {});
  const ids = missing.map((t) => t.id);
  const request = fetch(`https://itunes.apple.com/lookup?id=${ids.join(',')}&country=${country}`)
    .then((res) => (res.ok ? res.json() : { results: [] }))
    .then((body: { results?: { trackId?: number; trackTimeMillis?: number; releaseDate?: string }[] }) => {
      for (const r of body.results ?? []) {
        if (!r.trackId) continue;
        const year = r.releaseDate ? new Date(r.releaseDate).getUTCFullYear() : NaN;
        factCache.set(r.trackId, { durationMs: r.trackTimeMillis ?? null, releaseYear: Number.isFinite(year) ? year : null });
      }
    })
    .catch(() => {})
    .finally(() => ids.forEach((id) => factRequests.delete(id)));
  ids.forEach((id) => factRequests.set(id, request));
  return request;
}

/** Start fetching what the next few cards' prints need, so a swipe never waits. */
export function prefetchPrints(tracks: DiscoveryTrack[], country: string) {
  prefetchFacts(tracks, country);
  tracks.slice(0, 3).forEach((t) => inksFor(t.artworkUrl100));
}

const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

/** The song's print, from whatever has loaded within a moment. */
export async function printFor(track: DiscoveryTrack): Promise<Print> {
  const [inks] = await Promise.all([within(inksFor(track.artworkUrl100), 1500, null), within(factRequests.get(track.id) ?? Promise.resolve(), 1500, undefined)]);
  const facts = factCache.get(track.id);
  return makePrint({
    id: track.id,
    genre: track.primaryGenreName,
    inks,
    durationMs: facts?.durationMs,
    releaseYear: facts?.releaseYear,
  });
}
