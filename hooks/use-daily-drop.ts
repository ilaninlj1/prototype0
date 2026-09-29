import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  addPending,
  dropToDiscoveryTracks,
  likedDropTracks,
  nextDropIndex,
  todayKey,
  type Drop,
  type DropVote,
} from '@/lib/daily-drop';
import {
  appendLikedTrack,
  loadCachedDrop,
  loadDeviceId,
  loadDropProgress,
  loadPendingVotes,
  saveCachedDrop,
  saveDropProgress,
  savePendingVotes,
  type DropProgress,
} from '@/lib/discovery-storage';
import { fetchDrop, sendVotes } from '@/lib/supabase';

const SEND_WAIT_MS = 4_000;

// One flush at a time, app-wide, so two flushes can't overwrite each other's
// pending list. Votes are queued BEFORE sending and removed only once settled,
// so a kill mid-request leaves them queued for the next launch.
let flushing: Promise<void> = Promise.resolve();

function flushPending(entry?: DropProgress): Promise<void> {
  flushing = flushing.then(async () => {
    const deviceId = await loadDeviceId();
    let pending = await loadPendingVotes();
    if (entry) {
      pending = addPending(pending, entry);
      await savePendingVotes(pending);
    }
    for (const p of pending) {
      if (await sendVotes(p.day, deviceId, p.votes)) {
        pending = pending.filter((x) => x.day !== p.day);
        await savePendingVotes(pending);
      }
    }
  });
  return flushing;
}

/** Today's drop: resumes mid-drop, reloads when a new day starts, sends votes when finished. */
export function useDailyDrop() {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);
  const votesRef = useRef<DropVote[]>([]);
  const loadedDayRef = useRef<string | null>(null);

  const setVotesBoth = (next: DropVote[]) => {
    votesRef.current = next;
    setVotes(next);
  };

  const load = useCallback(async () => {
    flushPending();
    const progress = await loadDropProgress();
    // A drop in progress keeps its own day across midnight, but only
    // yesterday's — an older unfinished drop is a missed day.
    const today = todayKey(new Date());
    const yesterday = todayKey(new Date(Date.now() - 86_400_000));
    const resumable = progress && progress.votes.length < 5 && (progress.day === today || progress.day === yesterday);
    const day = resumable ? progress.day : today;
    if (loadedDayRef.current === day) return;
    const cached = await loadCachedDrop();
    const d = cached?.day === day ? cached : await fetchDrop(day);
    if (!d) return;
    loadedDayRef.current = day;
    await saveCachedDrop(d);
    setVotesBoth(progress?.day === day ? progress.votes : []);
    setDrop(d);
  }, []);

  useEffect(() => {
    load();
    // The Home tab never unmounts: check for a new day's drop on every return
    // to the foreground, unless a drop is being played right now.
    const sub = AppState.addEventListener('change', (state) => {
      const mid = votesRef.current.length > 0 && votesRef.current.length < 5;
      if (state === 'active' && !mid) load();
    });
    return () => sub.remove();
  }, [load]);

  const played = nextDropIndex(votes);
  const active = !!drop && played < 5;
  const cards = drop ? dropToDiscoveryTracks(drop).slice(played) : [];

  async function vote(liked: boolean): Promise<'more' | 'done'> {
    if (!drop) return 'done';
    const current = votesRef.current;
    const next = [...current, { position: current.length, liked }];
    setVotesBoth(next);
    await saveDropProgress({ day: drop.day, votes: next });
    if (next.length < 5) return 'more';
    for (const t of likedDropTracks(drop, next, Date.now())) await appendLikedTrack(t);
    // Give the send a moment so the results include your own votes.
    await Promise.race([flushPending({ day: drop.day, votes: next }), new Promise((r) => setTimeout(r, SEND_WAIT_MS))]);
    return 'done';
  }

  function undo() {
    const current = votesRef.current;
    if (!drop || current.length === 0 || current.length >= 5) return;
    const next = current.slice(0, -1);
    setVotesBoth(next);
    saveDropProgress({ day: drop.day, votes: next });
  }

  return { active, drop, cards, played, vote, undo, canUndo: active && votes.length > 0 };
}
