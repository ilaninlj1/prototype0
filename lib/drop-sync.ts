import { addPending, type PendingVotes } from './daily-drop';
import { loadDeviceId, loadPendingVotes, savePendingVotes } from './discovery-storage';
import { sendGuess, sendVotes } from './supabase';

const SEND_WAIT_MS = 4_000;

// One flush at a time, app-wide, so two flushes can't overwrite each other's
// pending list. Entries are queued BEFORE sending and removed only once
// settled, so a kill mid-request leaves them queued for the next launch.
// Votes and guesses are both idempotent server-side (primary keys), so
// resending an entry whose votes already landed is harmless.
let flushing: Promise<void> = Promise.resolve();

export function flushPending(entry?: PendingVotes): Promise<void> {
  flushing = flushing.then(async () => {
    const deviceId = await loadDeviceId();
    let pending = await loadPendingVotes();
    if (entry) {
      pending = addPending(pending, entry);
      await savePendingVotes(pending);
    }
    for (const p of pending) {
      const sent = (await sendVotes(p.day, deviceId, p.votes)) && (p.guess == null || (await sendGuess(p.day, deviceId, p.guess)));
      if (sent) {
        pending = pending.filter((x) => x.day !== p.day);
        await savePendingVotes(pending);
      }
    }
  });
  return flushing;
}

/** Flush, but give up waiting after a few seconds (the flush keeps going in the background). */
export function flushPendingBriefly(entry?: PendingVotes): Promise<unknown> {
  return Promise.race([flushPending(entry), new Promise((r) => setTimeout(r, SEND_WAIT_MS))]);
}
