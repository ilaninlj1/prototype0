import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { keepLine, routeStops, type RouteStop } from '@/lib/bottle-journey';
import { ringSeedOf } from '@/lib/bottle-print';
import type { Hop, RingSeed, Tier } from '@/lib/bottle-rows';
import { bottleSlotOpen, canLaunch, commit, enqueue, oldFinds, stage, unstage, type FeedMode, type OutboxItem } from '@/lib/bottles';
import {
  claimBottle,
  currentPlace,
  flushOutbox,
  launchesToday,
  loadLaunchFxCount,
  loadOldFindsOffered,
  noteLaunch,
  queueOutbox,
  resolveBottleTrack,
  saveBottlesOn,
  saveCityOk,
  saveLaunchFxCount,
  saveOldFindsOffered,
  useBottlesOn,
} from '@/lib/bottles-api';
import type { DiscoveryTrack, Region, SwipeEntry } from '@/lib/discovery';
import { loadLikedTracks } from '@/lib/discovery-storage';
import { normalizeArtist } from '@/lib/human-check';
import { soundFor } from '@/lib/sound-index';
import { soundLookup } from '@/lib/sound-lookup-app';

// Bottles on Home (spec docs/superpowers/specs/2026-10-28-bottles-design.md): a stranger's save
// may wash up as one card in five, a card leaving the top stages its bottle news (Undo takes it
// back), a save floats, and keeping a bottle shows who kept it before you.

export type KeepMoment = { key: number; trackId: number; hops: Hop[]; line: string; stops: RouteStop[] };
export type BottleAsk = { kind: 'consent' } | { kind: 'old'; finds: DiscoveryTrack[] };

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const LAUNCH_FX_TIMES = 3;

function soundOf(trackId: number) {
  const indexed = soundFor(trackId);
  if (indexed) return indexed;
  const cached = soundLookup.peek(trackId);
  return cached?.status === 'measured' ? cached.features : null;
}

/** The ring a keeper adds: from the last song they saved before this one. */
function previousRing(history: SwipeEntry[], trackId: number): RingSeed | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.action === 'like' && e.trackId !== trackId) return ringSeedOf(soundOf(e.trackId));
  }
  return null;
}

/** How long you'd listened when you saved it (the like's own entry). */
function likeListenMs(history: SwipeEntry[], trackId: number): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.trackId === trackId && e.action === 'like') return e.listenMs ?? 0;
  }
  return 0;
}

export function useBottles(region: Region) {
  const on = useBottlesOn();
  const sinceBottleRef = useRef(Number.POSITIVE_INFINITY);
  const claimingRef = useRef(false);
  const tiersRef = useRef(new Map<number, Tier | null>());
  const [keep, setKeep] = useState<KeepMoment | null>(null);
  const [ask, setAsk] = useState<BottleAsk | null>(null);
  const [launchFx, setLaunchFx] = useState(0);

  // Anything left from last time goes out now; leaving the app sends what's waiting.
  useEffect(() => {
    void flushOutbox();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') void queueOutbox(commit).then(flushOutbox);
    });
    return () => sub.remove();
  }, []);

  /** Home tells us how far each top card was from your taste, for the keep hop's tier. */
  function noteTier(trackId: number, tier: Tier | null) {
    tiersRef.current.set(trackId, tier);
  }

  /** A stranger's bottle for the next slot, already resolved and checked against `accept`, or null. */
  async function maybeBottle(i: {
    genre: string | null;
    mode: FeedMode;
    songsHeard: number;
    offline: boolean;
    bottleQueued: boolean;
    accept: (t: DiscoveryTrack) => boolean;
  }): Promise<DiscoveryTrack | null> {
    if (i.bottleQueued || claimingRef.current) return null;
    const open = bottleSlotOpen({ enabled: on === true, offline: i.offline, mode: i.mode, songsHeard: i.songsHeard, cardsSinceBottle: sinceBottleRef.current });
    if (!open) return null;
    claimingRef.current = true;
    try {
      const b = await claimBottle(i.genre);
      if (!b) return null;
      const track = await resolveBottleTrack(b, region);
      const verdict = !track ? 'unplayable' : !i.accept(track) ? 'known' : null;
      if (verdict) {
        await queueOutbox((o) => enqueue(o, { kind: 'verdict', id: id(), bottleId: b.id, verdict, place: null, tier: null, ring: null, at: Date.now() }));
        void flushOutbox();
        return null;
      }
      return track;
    } finally {
      claimingRef.current = false;
    }
  }

  /** A card left the top of the stack (any way: skip, Next, a genre jump). */
  async function exit(track: DiscoveryTrack, saved: boolean, history: SwipeEntry[]) {
    let item: OutboxItem | null = null;
    if (track.via === 'bottle' && track.bottleId) {
      sinceBottleRef.current = 0;
      item = {
        kind: 'verdict',
        id: id(),
        bottleId: track.bottleId,
        verdict: saved ? 'keep' : 'pass',
        place: saved ? await currentPlace(false) : null,
        tier: saved ? (tiersRef.current.get(track.id) ?? null) : null,
        ring: saved ? previousRing(history, track.id) : null,
        at: Date.now(),
      };
    } else {
      sinceBottleRef.current = Number.isFinite(sinceBottleRef.current) ? sinceBottleRef.current + 1 : sinceBottleRef.current;
      if (saved && on === true && canLaunch(track, likeListenMs(history, track.id), await launchesToday())) {
        item = {
          kind: 'launch',
          id: id(),
          trackId: track.id,
          artistKey: normalizeArtist(track.artistName),
          genreTag: track.primaryGenreName,
          place: await currentPlace(false),
          at: Date.now(),
        };
        await noteLaunch();
      }
    }
    tiersRef.current.delete(track.id);
    const staged = item;
    await queueOutbox((o) => (staged ? stage(o, staged) : commit(o)));
    void flushOutbox();
  }

  /** Undo brought the last card back: whatever it would have sent never happens. */
  function undo() {
    void queueOutbox(unstage);
  }

  /**
   * A save on Home. Returns true when this save will float (for the toast). A bottle shows the
   * keep moment; the first save ever asks about your city.
   */
  async function saved(track: DiscoveryTrack, history: SwipeEntry[], listenMs: number): Promise<boolean> {
    if (track.via === 'bottle' && track.bottle) {
      const place = await currentPlace(false);
      const own: Hop = {
        kind: 'keep',
        city: place.city,
        country: place.country,
        lat: place.lat,
        lng: place.lng,
        exact: place.exact,
        tier: tiersRef.current.get(track.id) ?? null,
        ring: previousRing(history, track.id),
        at: new Date().toISOString(),
      };
      setKeep({ key: Date.now(), trackId: track.id, hops: [...track.bottle.hops, own], line: keepLine(track.bottle), stops: routeStops(track.bottle, place) });
      return false;
    }
    if (on === null) {
      setAsk({ kind: 'consent' });
      return false;
    }
    const floats = on === true && canLaunch(track, listenMs, await launchesToday());
    if (floats) {
      const shown = await loadLaunchFxCount();
      if (shown < LAUNCH_FX_TIMES) {
        setLaunchFx(Date.now());
        void saveLaunchFxCount(shown + 1);
      }
    }
    return floats;
  }

  /** The first-time card's answer. Either way your saves float; "Use my city" asks for location. */
  async function answerConsent(useCity: boolean, history: SwipeEntry[]) {
    saveBottlesOn(true);
    setAsk(null);
    await saveCityOk(useCity);
    await currentPlace(useCity);
    if (await loadOldFindsOffered()) return;
    const finds = oldFinds(history, await loadLikedTracks());
    if (finds.length > 0) setAsk({ kind: 'old', finds });
    else void saveOldFindsOffered();
  }

  /** "Float your old finds": straight out, past Undo, under the server's once-only cap. */
  async function answerOldFinds(float: boolean) {
    const finds = ask?.kind === 'old' ? ask.finds : [];
    setAsk(null);
    void saveOldFindsOffered();
    if (!float) return;
    const place = await currentPlace(false);
    await queueOutbox((o) =>
      finds.reduce(
        (acc, t) =>
          enqueue(acc, {
            kind: 'launch',
            id: id(),
            trackId: t.id,
            artistKey: normalizeArtist(t.artistName),
            genreTag: t.primaryGenreName,
            place,
            old: true,
            at: Date.now(),
          }),
        o
      )
    );
    void flushOutbox();
  }

  return {
    on,
    keep,
    dismissKeep: () => setKeep(null),
    ask,
    answerConsent,
    answerOldFinds,
    dismissAsk: () => setAsk(null),
    launchFx,
    noteTier,
    maybeBottle,
    exit,
    undo,
    saved,
  };
}
