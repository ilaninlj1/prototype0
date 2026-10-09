// Home's feed loading, as explicit states (Prototype 6, asynchronous
// behavior): waiting (slow after 6s), succeeded, failed (offline or nothing
// left), and stopped by the person. What the panel says and which buttons it
// offers come from here. Pure.

export type FeedLoad =
  | { phase: 'idle' }
  | { phase: 'waiting'; label: string; since: number; attempt: number }
  | { phase: 'failed'; label: string; reason: 'offline' | 'empty'; attempt: number }
  | { phase: 'stopped'; label: string };

export type FeedAction = 'cancel' | 'retry' | 'another';

export const IDLE: FeedLoad = { phase: 'idle' };
export const SLOW_MS = 6000;

/** A load begins. Retrying the same thing after a failure counts as another attempt. */
export function start(prev: FeedLoad, label: string, now: number): FeedLoad {
  const attempt = prev.phase === 'failed' && prev.label === label ? prev.attempt + 1 : 1;
  return { phase: 'waiting', label, since: now, attempt };
}

export function succeed(): FeedLoad {
  return IDLE;
}

export function fail(prev: FeedLoad, reason: 'offline' | 'empty'): FeedLoad {
  const label = prev.phase === 'idle' ? '' : prev.label;
  const attempt = prev.phase === 'waiting' || prev.phase === 'failed' ? prev.attempt : 1;
  return { phase: 'failed', label, reason, attempt };
}

/** The person cancels a load in progress. */
export function stop(prev: FeedLoad): FeedLoad {
  return prev.phase === 'waiting' ? { phase: 'stopped', label: prev.label } : prev;
}

export function isSlow(s: FeedLoad, now: number): boolean {
  return s.phase === 'waiting' && now - s.since >= SLOW_MS;
}

/** What the panel in place of the card says, or null when there's nothing to say. */
export function panel(s: FeedLoad, now: number): { title: string; body: string; actions: FeedAction[] } | null {
  const name = s.phase === 'idle' ? '' : s.label.toUpperCase();
  switch (s.phase) {
    case 'idle':
      return null;
    case 'waiting':
      return {
        title: `FINDING SONGS · ${name}`,
        body: isSlow(s, now) ? 'Taking longer than usual. The music store is slow right now.' : '',
        actions: ['cancel'],
      };
    case 'failed':
      return s.reason === 'empty'
        ? { title: `NO SONGS LEFT IN ${name}`, body: 'You’ve heard everything we have here for now.', actions: ['another'] }
        : {
            title: 'COULDN’T LOAD SONGS',
            body: s.attempt > 1 ? `Still not working after ${s.attempt} tries. Check your connection.` : 'Check your connection, then try again.',
            actions: ['retry', 'another'],
          };
    case 'stopped':
      return { title: 'STOPPED', body: 'Nothing changed. Try again, or go somewhere else.', actions: ['retry', 'another'] };
  }
}

/** Tune → Test network: try the loading screens on purpose. Feed loading only, never audio; resets on restart. */
export type NetworkTest = 'off' | 'slow' | 'offline';
const SLOW_TEST_MS = 8000;

export async function simulate<T>(mode: NetworkTest, run: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  if (mode === 'offline') throw new Error('Test network: offline');
  if (mode === 'slow') await sleep(SLOW_TEST_MS);
  return run();
}
