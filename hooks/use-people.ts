import { useCallback, useEffect, useRef, useState } from 'react';

import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import { appendSwipeEntry } from '@/lib/discovery-storage';
import { newlyInTune, type Person } from '@/lib/people';
import {
  fetchDeck,
  fetchPeople,
  fetchProgress,
  loadKnown,
  peopleStatus,
  refreshPrint,
  saveKnown,
  sendVerdict,
  tellPeopleNews,
  type DeckCard,
  type PeopleStatus,
  type Progress,
} from '@/lib/people-api';
import { saveLike } from '@/components/like-button';

const DECK_SIZE = 12;
const REFILL_AT = 3;

/** The People tab's state: are you in, the song deck, who you're in tune with, and the moment when someone new is. */
export function usePeople() {
  const [status, setStatus] = useState<PeopleStatus | 'loading'>('loading');
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [deckLoading, setDeckLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [moment, setMoment] = useState<Person | null>(null);
  // Everything judged since the tab opened: its verdict may still be on the way to the server.
  const judged = useRef(new Set<number>());
  const filling = useRef(false);
  const deckRef = useRef<DeckCard[]>([]);

  const putDeck = useCallback((next: DeckCard[]) => {
    deckRef.current = next;
    setDeck(next);
  }, []);

  const fill = useCallback(async () => {
    if (filling.current || deckRef.current.length > REFILL_AT) return;
    filling.current = true;
    const skip = new Set([...judged.current, ...deckRef.current.map((c) => c.track.id)]);
    try {
      const more = await fetchDeck(DECK_SIZE, skip);
      if (more) {
        const have = new Set(deckRef.current.map((c) => c.track.id));
        putDeck([...deckRef.current, ...more.filter((c) => !have.has(c.track.id) && !judged.current.has(c.track.id))]);
      }
    } finally {
      filling.current = false;
      setDeckLoading(false);
    }
  }, [putDeck]);

  const refreshPeople = useCallback(async () => {
    const [list, prog] = await Promise.all([fetchPeople(), fetchProgress()]);
    if (prog) setProgress(prog);
    if (!list) return;
    setPeople(list);
    tellPeopleNews(list);
    const known = await loadKnown();
    const fresh = newlyInTune(known, list.map((p) => p.row.person));
    if (fresh.length) {
      setMoment(list.find((p) => p.row.person === fresh[0]) ?? null);
      fresh.forEach((id) => known.add(id));
      await saveKnown(known);
    }
  }, []);

  const load = useCallback(async () => {
    const s = await peopleStatus();
    setStatus(s);
    if (s !== 'member') return;
    refreshPrint();
    await Promise.all([fill(), refreshPeople()]);
  }, [fill, refreshPeople]);

  useEffect(() => {
    if (status === 'member') fill();
  }, [deck.length, status, fill]);

  /** A verdict on the top card. A heart stays on screen for its reveal; `next()` moves on. */
  async function verdict(card: DeckCard, hearted: boolean, heardMs: number, shownAt: number) {
    const t: DiscoveryTrack = card.track;
    judged.current.add(t.id);
    const entry: SwipeEntry = {
      trackId: t.id,
      trackName: t.trackName,
      artistId: t.artistId,
      artistName: t.artistName,
      genre: t.primaryGenreName,
      action: hearted ? 'like' : 'skip',
      timestamp: Date.now(),
      artistListeners: t.artistListeners,
      listenMs: heardMs,
      dwellMs: Date.now() - shownAt,
      source: 'people',
    };
    await appendSwipeEntry(entry);
    if (hearted) await saveLike(t);
    await sendVerdict(t, hearted);
    if (hearted) await refreshPeople();
  }

  function next() {
    putDeck(deckRef.current.slice(1));
  }

  return { status, setStatus, deck, deckLoading, people, progress, moment, closeMoment: () => setMoment(null), load, refreshPeople, verdict, next };
}
