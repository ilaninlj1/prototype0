import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  dropToDiscoveryTracks,
  likedDropTracks,
  nextDropIndex,
  todayKey,
  type Drop,
  type DropVote,
} from '@/lib/daily-drop';
import { appendLikedTrack, loadCachedDrop, loadDropProgress, saveCachedDrop, saveDropProgress } from '@/lib/discovery-storage';
import { flushPending, flushPendingBriefly } from '@/lib/drop-sync';
import { fetchDrop } from '@/lib/supabase';

/** Today's drop: resumes mid-drop, reloads when a new day starts, sends votes when finished. */
export function useDailyDrop() {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);
  const [guess, setGuess] = useState<number | undefined>(undefined);
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
    setGuess(progress?.day === day ? progress.guess : undefined);
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

  /** Re-read progress from storage (another screen may have played or guessed). */
  const refresh = useCallback(async () => {
    loadedDayRef.current = null;
    await load();
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
    // Votes go now; the guess follows from the guess screen.
    flushPendingBriefly({ day: drop.day, votes: next });
    return 'done';
  }

  function undo() {
    const current = votesRef.current;
    if (!drop || current.length === 0 || current.length >= 5) return;
    const next = current.slice(0, -1);
    setVotesBoth(next);
    saveDropProgress({ day: drop.day, votes: next });
  }

  const finishedToday = !!drop && played === 5 && drop.day === todayKey(new Date());
  const likedCount = votes.filter((v) => v.liked).length;
  const guessRight = !!drop && guess != null && drop.songs[guess]?.slot === 'famous';
  return {
    active,
    finishedToday,
    drop,
    cards,
    played,
    guess,
    likedCount,
    guessRight,
    refresh,
    vote,
    undo,
    canUndo: active && votes.length > 0,
  };
}
