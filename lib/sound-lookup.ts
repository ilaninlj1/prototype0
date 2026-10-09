import { featuresByIsrc, deezerQuery, pickDeezerMatch, type DeezerHit } from './sound-match.ts';
import type { SoundRecord } from './sound.ts';

// Live sound lookup for songs outside assets/sound-index.json (artist steering,
// search). Same route as scripts/build-sound-index.ts: Deezer search for the
// ISRC, then ReccoBeats' catalog values. Never touches preview audio.
const DEEZER = 'https://api.deezer.com/search?limit=10&q=';
const RECCO = 'https://api.reccobeats.com/v1/audio-features?ids=';
const AT_ONCE = 2;
const RETRY_UNMATCHED_MS = 14 * 24 * 3600 * 1000;

export type Lookupable = { id: number; trackName?: string; artistName?: string };

type Deps = {
  fetch: typeof fetch;
  read: () => Promise<Record<number, SoundRecord>>;
  write: (all: Record<number, SoundRecord>) => Promise<void>;
  now: () => number;
};

export function createSoundLookup(deps: Deps) {
  let cache: Record<number, SoundRecord> | null = null;
  const inFlight = new Map<number, Promise<SoundRecord | null>>();
  let pausedUntil = 0;
  let running = 0;
  const waiting: (() => void)[] = [];

  const slot = async () => {
    if (running >= AT_ONCE) await new Promise<void>((r) => waiting.push(r));
    running += 1;
  };
  const release = () => {
    running -= 1;
    waiting.shift()?.();
  };

  async function get(url: string): Promise<Response | 'limited' | null> {
    try {
      const res = await deps.fetch(url);
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After')) || 60;
        pausedUntil = deps.now() + wait * 1000;
        return 'limited';
      }
      return res.ok ? res : null;
    } catch {
      return null;
    }
  }

  async function fresh(t: Required<Lookupable>): Promise<SoundRecord | null> {
    const d = await get(DEEZER + encodeURIComponent(deezerQuery(t.trackName, t.artistName)));
    if (d === 'limited' || d === null) return null;
    const hits = ((await d.json()) as { data?: DeezerHit[] }).data ?? [];
    const hit = pickDeezerMatch(t.trackName, t.artistName, hits);
    if (!hit?.isrc) return { status: 'unmatched', at: deps.now() };
    const r = await get(RECCO + encodeURIComponent(hit.isrc));
    if (r === 'limited' || r === null) return null;
    const rows = ((await r.json()) as { content?: unknown[] }).content ?? [];
    const features = featuresByIsrc(rows).get(hit.isrc.toUpperCase());
    return features
      ? { status: 'measured', features, source: 'live', isrc: hit.isrc, at: deps.now() }
      : { status: 'unmatched', at: deps.now() };
  }

  async function lookup(t: Lookupable): Promise<SoundRecord | null> {
    cache ??= await deps.read().catch(() => ({}));
    const hit = cache[t.id];
    if (hit && (hit.status === 'measured' || deps.now() - hit.at < RETRY_UNMATCHED_MS)) return hit;
    if (!t.trackName || !t.artistName || deps.now() < pausedUntil) return null;
    const pending = inFlight.get(t.id);
    if (pending) return pending;
    const job = (async () => {
      await slot();
      try {
        if (deps.now() < pausedUntil) return null;
        const rec = await fresh(t as Required<Lookupable>);
        if (rec) {
          cache![t.id] = rec;
          await deps.write({ ...cache! }).catch(() => {});
        }
        return rec;
      } finally {
        release();
        inFlight.delete(t.id);
      }
    })();
    inFlight.set(t.id, job);
    return job;
  }

  return {
    lookup,
    peek: (id: number) => cache?.[id] ?? null,
    paused: () => deps.now() < pausedUntil,
  };
}
