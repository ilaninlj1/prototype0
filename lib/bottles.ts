// Bottles on Home: when a stranger's save may wash up in the feed, which saves may float, and
// the outbox that holds a card's bottle news until Undo can no longer take it back. Pure; the
// network side is lib/bottles-api.ts. Spec: docs/superpowers/specs/2026-10-28-bottles-design.md.

import type { Place, RingSeed, Tier, Verdict } from './bottle-rows.ts';
import { RATED_LISTEN_THRESHOLD_MS, type DiscoveryTrack, type SwipeEntry } from './discovery.ts';

/** At most one bottle in every 5 cards. */
export const BOTTLE_EVERY = 5;
/** A new listener's first songs are the plain blind feed. */
export const FIRST_SONGS_WITHOUT = 5;
export const LAUNCHES_PER_DAY = 20;
/** "Float your old finds" sends at most this many, once. */
export const OLD_FINDS_MAX = 30;

/** Where Home's songs are coming from. Artist steering and the Dark Map are you asking for something specific. */
export type FeedMode = 'genre' | 'sorted' | 'artist' | 'map';

export function bottleSlotOpen(i: { enabled: boolean; offline: boolean; mode: FeedMode; songsHeard: number; cardsSinceBottle: number }): boolean {
  if (!i.enabled || i.offline) return false;
  if (i.mode === 'artist' || i.mode === 'map') return false;
  if (i.songsHeard < FIRST_SONGS_WITHOUT) return false;
  return i.cardsSinceBottle >= BOTTLE_EVERY - 1;
}

/** A save floats when it was a blind find you actually heard: not a bottle, 10 s or more, under the day's cap. */
export function canLaunch(track: DiscoveryTrack, listenMs: number, launchesToday: number): boolean {
  return track.via !== 'bottle' && listenMs >= RATED_LISTEN_THRESHOLD_MS && launchesToday < LAUNCHES_PER_DAY;
}

export type OutboxItem =
  | { kind: 'launch'; id: string; trackId: number; artistKey: string; genreTag: string; place: Place | null; old?: boolean; at: number }
  | { kind: 'verdict'; id: string; bottleId: string; verdict: Verdict; place: Place | null; tier: Tier | null; ring: RingSeed | null; at: number };

/** `pending` is the last card's item, still undoable; `queued` is what's ready to send, oldest first. */
export type Outbox = { pending: OutboxItem | null; queued: OutboxItem[] };
export const EMPTY_OUTBOX: Outbox = { pending: null, queued: [] };

/** A card left the top: its item waits, and the one before it can't be undone anymore. */
export function stage(o: Outbox, item: OutboxItem): Outbox {
  return { pending: item, queued: o.pending ? [...o.queued, o.pending] : o.queued };
}

/** Undo: the card came back, so its item never happened. */
export function unstage(o: Outbox): Outbox {
  return o.pending ? { pending: null, queued: o.queued } : o;
}

/** The app went to the background: send what's waiting. */
export function commit(o: Outbox): Outbox {
  return o.pending ? { pending: null, queued: [...o.queued, o.pending] } : o;
}

/** Straight to sending, past Undo: a bottle filtered out or unplayable before it ever showed. */
export function enqueue(o: Outbox, item: OutboxItem): Outbox {
  return { pending: o.pending, queued: [...o.queued, item] };
}

export function sent(o: Outbox, ids: string[]): Outbox {
  const done = new Set(ids);
  return { pending: o.pending, queued: o.queued.filter((i) => !done.has(i.id)) };
}

/** Past saves that were blind feed finds heard 10 s or more, newest first: what "Float your old finds" offers. */
export function oldFinds(history: SwipeEntry[], liked: DiscoveryTrack[]): DiscoveryTrack[] {
  const heardAt = new Map<number, number>();
  for (const e of history) {
    if (e.action !== 'like' || (e.listenMs ?? 0) < RATED_LISTEN_THRESHOLD_MS) continue;
    if (e.source === 'drop' || e.source === 'bottle') continue;
    heardAt.set(e.trackId, Math.max(heardAt.get(e.trackId) ?? 0, e.timestamp));
  }
  return liked
    .filter((t) => heardAt.has(t.id) && t.via !== 'bottle')
    .sort((a, b) => heardAt.get(b.id)! - heardAt.get(a.id)!)
    .slice(0, OLD_FINDS_MAX);
}
