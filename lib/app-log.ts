// The app's own log: what happened and when, kept on the phone so a tester can
// send it. Pure; storage, catching errors and the screen are lib/app-log-app.ts
// and app/log.tsx.

export type LogKind = 'info' | 'warn' | 'error';
export type LogEntry = { t: number; kind: LogKind; area: string; msg: string };

export const LOG_LIMIT = 500;
const MSG_LIMIT = 1000;

/** The list with `entry` added, keeping only the newest `limit`. */
export function addEntry(list: LogEntry[], entry: LogEntry, limit = LOG_LIMIT): LogEntry[] {
  const msg = entry.msg.length > MSG_LIMIT ? `${entry.msg.slice(0, MSG_LIMIT)}…` : entry.msg;
  const next = [...list, { ...entry, msg }];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

const two = (n: number) => String(n).padStart(2, '0');

export function clockOf(t: number): string {
  const d = new Date(t);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

const KIND_LABEL: Record<LogKind, string> = { info: 'info ', warn: 'warn ', error: 'ERROR' };

// ---------- Writing to it from anywhere ----------

type Sink = (entry: LogEntry) => void;
let sink: Sink | null = null;

/** Where entries go: lib/app-log-app.ts on a phone, nothing in the tests. */
export function setLogSink(next: Sink | null) {
  sink = next;
}

export function log(area: string, msg: string, kind: LogKind = 'info') {
  sink?.({ t: Date.now(), kind, area, msg });
}

export function describeError(e: unknown): string {
  if (e instanceof Error) {
    const where = e.stack?.split('\n').slice(1, 4).map((l) => l.trim()).join(' | ');
    return where ? `${e.message} @ ${where}` : e.message;
  }
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Runs `work` and logs how long it took, or the error it failed with (and still throws it). */
export async function timed<T>(area: string, what: string, work: () => Promise<T>, describe?: (value: T) => string): Promise<T> {
  const start = Date.now();
  try {
    const value = await work();
    log(area, `${what} ${describe ? describe(value) : 'done'} in ${Date.now() - start}ms`);
    return value;
  } catch (e) {
    log(area, `${what} failed after ${Date.now() - start}ms: ${describeError(e)}`, 'error');
    throw e;
  }
}

/** The text a tester shares: the phone's details, a blank line, then one line per entry, oldest first. */
export function formatLog(list: LogEntry[], header: string[]): string {
  return [...header, '', ...list.map((e) => `${clockOf(e.t)} ${KIND_LABEL[e.kind]} ${e.area}  ${e.msg}`)].join('\n');
}
