/**
 * `work`, or an error once `ms` have passed. Phones don't time out a stalled
 * request on their own for a long while (Android can wait forever), so a
 * screen waiting on one would spin with no way out.
 */
export function within<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took longer than ${ms / 1000}s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
