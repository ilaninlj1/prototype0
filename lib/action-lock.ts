/**
 * Home's one-action-at-a-time guard: swipes, buttons and Undo all take it
 * first. A lock older than `staleMs` frees itself, so one handler that throws
 * can't freeze the feed.
 */
export function createActionLock(now: () => number = Date.now, staleMs = 4000) {
  let since: number | null = null;
  return {
    take(): boolean {
      if (since != null && now() - since < staleMs) return false;
      since = now();
      return true;
    },
    release() {
      since = null;
    },
    held: () => since != null && now() - since < staleMs,
  };
}
