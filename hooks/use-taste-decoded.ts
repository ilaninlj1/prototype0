import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import baselinesRaw from '../assets/genre-sound.json' with { type: 'json' };
import { useSongFeel } from '@/hooks/use-song-feel';
import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import {
  loadBlindTest,
  loadCalls,
  loadDecodedSeen,
  loadDecodedVotes,
  loadLikedTracks,
  loadListenersNow,
  loadNewsSeen,
  loadReleaseChecks,
  loadSwipeHistory,
  saveDecodedSeen,
  saveDecodedVotes,
  type BlindTestResult,
} from '@/lib/discovery-storage';
import { buildFindsNews } from '@/lib/finds-news';
import type { Baselines } from '@/lib/genre-sound';
import { setWeeklyNudge } from '@/lib/nudge';
import { nudgeContent } from '@/lib/nudge-config';
import { loadFeels } from '@/lib/song-feel-api';
import { sendDecodedVote } from '@/lib/supabase';
import { decodedPrompt, decodeTaste, markSent, nextVote, unseenFinding, type DecodedVotes, type Finding } from '@/lib/taste-decoded';

// JSON numbers come in as number[], not 5-tuples; scripts/measure-genre-sound.ts wrote this exact shape.
const BASELINES = baselinesRaw as unknown as Baselines;

// The YOU tab's red dot (components/tab-bar.tsx) listens here. Sticky, so a
// tab bar that mounts after the app-start check still hears about it.
const newsListeners = new Set<() => void>();
let hasNews = false;

export function onDecodedNews(fn: () => void): () => void {
  newsListeners.add(fn);
  if (hasNews) fn();
  return () => {
    newsListeners.delete(fn);
  };
}

/** Recompute from storage; light the YOU dot for a finding nobody has opened; point the Sunday reminder at it. App start and after the Blind Spot Test. */
export async function refreshDecodedNews(): Promise<void> {
  const [liked, history, feels, test, seen, newsSeen, releaseChecks, calls, listenersNow] = await Promise.all([
    loadLikedTracks(),
    loadSwipeHistory(),
    loadFeels(),
    loadBlindTest(),
    loadDecodedSeen(),
    loadNewsSeen(),
    loadReleaseChecks(),
    loadCalls(),
    loadListenersNow(),
  ]);
  const unseen = unseenFinding(decodeTaste({ liked, history, feels, test }, BASELINES), seen);
  hasNews = unseen != null;
  if (hasNews) newsListeners.forEach((fn) => fn());
  const news = buildFindsNews({
    likedTracks: liked,
    newsSeen,
    releaseChecks,
    calls,
    listenersNow: Object.fromEntries(Object.entries(listenersNow).map(([k, v]) => [k, v.listeners])),
  });
  const topNews = news[0] ?? null;
  await setWeeklyNudge(nudgeContent(topNews, unseen));
}


/** Findings for the You tab and the Decoded page. Measures saves that still need it, sharing the Tasteform's cache. */
export function useTasteDecoded(liked: DiscoveryTrack[], history: SwipeEntry[]) {
  const feels = useSongFeel(liked);
  const [test, setTest] = useState<BlindTestResult | null>(null);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [votes, setVotes] = useState<DecodedVotes>({});

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([loadBlindTest(), loadDecodedSeen(), loadDecodedVotes()]).then(([t, s, v]) => {
        if (cancelled) return;
        setTest(t);
        setSeen(s);
        setVotes(v);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const findings = useMemo(() => decodeTaste({ liked, history, feels, test }, BASELINES), [liked, history, feels, test]);
  const unseen = seen ? unseenFinding(findings, seen) : null;

  // Keep the Sunday reminder in step with what's on screen.
  const unseenId = unseen?.id ?? null;
  useEffect(() => {
    if (seen) setWeeklyNudge(nudgeContent(null, unseen));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the unseen finding changes, not its object
  }, [unseenId, seen != null]);


  async function markSeen() {
    const ids = [...new Set([...(seen ?? []), ...findings.map((f) => f.id)])];
    setSeen(ids);
    hasNews = false;
    await saveDecodedSeen(ids);
  }

  async function vote(f: Finding, agree: boolean) {
    const next = nextVote(votes, f.id, agree);
    setVotes(next.votes);
    await saveDecodedVotes(next.votes);
    if (!next.send) return;
    if (await sendDecodedVote({ kind: f.kind, measure: f.measure, side: f.side, agree })) {
      const marked = markSent(next.votes, f.id);
      setVotes(marked);
      await saveDecodedVotes(marked);
    }
  }

  return {
    findings,
    prompt: decodedPrompt(liked.length, test),
    isNew: !!findings[0] && !!seen && !seen.includes(findings[0].id),
    ready: seen != null,
    votes,
    vote,
    markSeen,
  };
}
