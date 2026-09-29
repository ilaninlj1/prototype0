import { useEffect, useState } from 'react';

import { dropToDiscoveryTracks, nextDropIndex, todayKey, type Drop, type DropVote } from '@/lib/daily-drop';
import {
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

async function flushPending(deviceId: string, extra: DropProgress[] = []) {
  const pending = [...(await loadPendingVotes()), ...extra];
  const still: DropProgress[] = [];
  for (const p of pending) if (!(await sendVotes(p.day, deviceId, p.votes))) still.push(p);
  await savePendingVotes(still);
}

/** Today's drop: loads once per mount, resumes mid-drop, sends votes when finished. */
export function useDailyDrop() {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);

  useEffect(() => {
    (async () => {
      const deviceId = await loadDeviceId();
      flushPending(deviceId);
      const progress = await loadDropProgress();
      // A drop in progress keeps its own day across midnight, but only
      // yesterday's — an older unfinished drop is a missed day.
      const today = todayKey(new Date());
      const yesterday = todayKey(new Date(Date.now() - 86_400_000));
      const resumable = progress && progress.votes.length < 5 && (progress.day === today || progress.day === yesterday);
      const day = resumable ? progress.day : today;
      const cached = await loadCachedDrop();
      const d = cached?.day === day ? cached : await fetchDrop(day);
      if (!d) return;
      await saveCachedDrop(d);
      setVotes(progress?.day === day ? progress.votes : []);
      setDrop(d);
    })();
  }, []);

  const played = nextDropIndex(votes);
  const active = !!drop && played < 5;
  const cards = drop ? dropToDiscoveryTracks(drop).slice(played) : [];

  async function vote(liked: boolean): Promise<'more' | 'done'> {
    if (!drop) return 'done';
    const next = [...votes, { position: played, liked }];
    setVotes(next);
    await saveDropProgress({ day: drop.day, votes: next });
    if (next.length < 5) return 'more';
    flushPending(await loadDeviceId(), [{ day: drop.day, votes: next }]);
    return 'done';
  }

  function undo() {
    if (!drop || votes.length === 0 || votes.length >= 5) return;
    const next = votes.slice(0, -1);
    setVotes(next);
    saveDropProgress({ day: drop.day, votes: next });
  }

  return { active, drop, cards, played, vote, undo, canUndo: active && votes.length > 0 };
}
