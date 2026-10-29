import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { BOTTLE_LEAD, stepAfterExit } from '@/lib/bottle-countdown';
import { keepLine, routeStops, type RouteStop } from '@/lib/bottle-journey';
import { ringSeedOf } from '@/lib/bottle-print';
import type { Hop, RingSeed, Tier } from '@/lib/bottle-rows';
import { BOTTLE_EVERY, bottleSlotOpen, canLaunch, commit, enqueue, oldFinds, stage, unstage, type FeedMode, type OutboxItem } from '@/lib/bottles';
import {
  claimBottle,
  currentPlace,
  flushOutbox,
  launchesToday,
  loadOldFindsOffered,
  noteLaunch,
  queueOutbox,
  resolveBottleTrack,
  saveBottlesOn,
  saveCityOk,
  saveOldFindsOffered,
  useBottlesOn,
} from '@/lib/bottles-api';
import type { DiscoveryTrack, Region, SwipeEntry } from '@/lib/discovery';
import { loadLikedTracks } from '@/lib/discovery-storage';
import { normalizeArtist } from '@/lib/human-check';
import { recipeFor } from '@/lib/print-recipe';
import { soundFor } from '@/lib/sound-index';
import { soundLookup } from '@/lib/sound-lookup-app';

// Bottles on Home (spec docs/superpowers/specs/2026-10-28-bottles-design.md): a stranger's save
// may wash up as one card in five, a card leaving the top stages its bottle news (Undo takes it
// back), a save floats, and keeping a bottle shows who kept it before you.

export type KeepMoment = { key: number; trackId: number; hops: Hop[]; line: string; stops: RouteStop[] };
export type BottleAsk = { kind: 'consent' } | { kind: 'old'; finds: DiscoveryTrack[] };

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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

/** The song's light: its print's main colour (amber when it has no sound data). */
export function songLight(trackId: number): string {
  const r = recipeFor(trackId, soundOf(trackId), null);
  return r.source === 'sound' ? r.rings[0].color : '#e8a33d';
}

/** How long the card played before it left (its latest entry). */
function exitListenMs(history: SwipeEntry[], trackId: number): number {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].trackId === trackId) return history[i].listenMs ?? 0;
  return 0;
}

/** How long you'd listened when you saved it (the like's own entry). */
function likeListenMs(history: SwipeEntry[], trackId: number): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.trackId === trackId && e.action === 'like') return e.listenMs ?? 0;
  }
  return 0;
}

export type Incoming = { track: DiscoveryTrack; stepsLeft: number };

export function useBottles(region: Region) {
  const on = useBottlesOn();
  const claimingRef = useRef(false);
  // The stranger's bottle out in the sea (lib/bottle-countdown.ts), and whether the last card moved it (for Undo).
  const [incoming, setIncomingState] = useState<Incoming | null>(null);
  const incomingRef = useRef<Incoming | null>(null);
  const setIncoming = (next: Incoming | null) => {
    incomingRef.current = next;
    setIncomingState(next);
  };
  const advancedRef = useRef(false);
  const tiersRef = useRef(new Map<number, Tier | null>());
  const [keep, setKeep] = useState<KeepMoment | null>(null);
  const [ask, setAsk] = useState<BottleAsk | null>(null);
  const [launchFx, setLaunchFx] = useState<{ key: number; color: string } | null>(null);

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

  /** Put a stranger's bottle out in the sea, BOTTLE_LEAD songs away, if there's none and one may come. */
  async function ensureIncoming(i: { genre: string | null; mode: FeedMode; songsHeard: number; offline: boolean; accept: (t: DiscoveryTrack) => boolean }) {
    if (incomingRef.current || claimingRef.current) return;
    const open = bottleSlotOpen({ enabled: on === true, offline: i.offline, mode: i.mode, songsHeard: i.songsHeard, cardsSinceBottle: BOTTLE_EVERY });
    if (!open) return;
    claimingRef.current = true;
    try {
      const b = await claimBottle(i.genre);
      if (!b) return;
      const track = await resolveBottleTrack(b, region);
      const verdict = !track ? 'unplayable' : !i.accept(track) ? 'known' : null;
      if (verdict || !track) {
        await queueOutbox((o) => enqueue(o, { kind: 'verdict', id: id(), bottleId: b.id, verdict: verdict ?? 'unplayable', place: null, tier: null, ring: null, at: Date.now() }));
        void flushOutbox();
        return;
      }
      setIncoming({ track, stepsLeft: BOTTLE_LEAD });
    } finally {
      claimingRef.current = false;
    }
  }

  /** A card left the top of the stack (any way: skip, Next, a genre jump). */
  async function exit(track: DiscoveryTrack, saved: boolean, history: SwipeEntry[], counts: boolean) {
    // The countdown: the bottle's own card leaving ends it; any other real listen floats it a step closer.
    const inc = incomingRef.current;
    advancedRef.current = false;
    if (inc && track.via === 'bottle' && track.bottleId === inc.track.bottleId) setIncoming(null);
    else if (inc) {
      const next = stepAfterExit(inc.stepsLeft, exitListenMs(history, track.id), counts);
      advancedRef.current = next !== inc.stepsLeft;
      if (advancedRef.current) setIncoming({ ...inc, stepsLeft: next });
    }
    let item: OutboxItem | null = null;
    if (track.via === 'bottle' && track.bottleId) {
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
    const inc = incomingRef.current;
    if (inc && advancedRef.current) setIncoming({ ...inc, stepsLeft: Math.min(BOTTLE_LEAD, inc.stepsLeft + 1) });
    advancedRef.current = false;
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
    // Every save that floats sets sail: its light drops into the sea and a bottle carries it off.
    if (floats) setLaunchFx({ key: Date.now(), color: songLight(track.id) });
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
    incoming,
    noteTier,
    ensureIncoming,
    exit,
    undo,
    saved,
  };
}
