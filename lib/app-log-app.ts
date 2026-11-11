// The phone side of the app's log (lib/app-log.ts): kept in storage across
// opens, fed by crashes and console errors as well as the app's own lines,
// and read by the Log screen (app/log.tsx, Tune → More → Log).

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { addEntry, describeError, formatLog, log, setLogSink, type LogEntry } from './app-log';

const KEY = 'app-log-v1';

let entries: LogEntry[] = [];
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  listeners.forEach((fn) => fn());
}

function saveNow() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = undefined;
  void AsyncStorage.setItem(KEY, JSON.stringify(entries)).catch(() => {});
}

function saveSoon() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, 1000);
}

function keep(entry: LogEntry) {
  entries = addEntry(entries, entry);
  emit();
  if (entry.kind === 'error') saveNow();
  else saveSoon();
}

/** Which app this is and what it's running on, at the top of everything shared. */
export function phoneDetails(): string[] {
  const lines: string[] = [];
  try {
    const p = Platform as unknown as { constants?: { Brand?: string; Model?: string } };
    const model = Platform.OS === 'android' ? ` · ${p.constants?.Brand ?? ''} ${p.constants?.Model ?? ''}`.trimEnd() : '';
    lines.push(`Blindspot ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${Platform.Version}${model}`);
    lines.push(`Build ${process.env.EXPO_PUBLIC_BUILD_COMMIT ?? 'dev'} · in ${Constants.executionEnvironment === 'storeClient' ? 'Expo Go' : 'the app'}`);
    const m = (Constants as unknown as { manifest2?: { id?: string; createdAt?: string } }).manifest2;
    const id = Updates.updateId ?? m?.id ?? 'built in';
    const made = Updates.createdAt?.toISOString() ?? m?.createdAt ?? '';
    lines.push(`Update ${id}${Updates.channel ? ` · channel ${Updates.channel}` : ''}${made ? ` · made ${made}` : ''}`);
  } catch (e) {
    lines.push(`Details unavailable: ${describeError(e)}`);
  }
  return lines;
}

let installed = false;

/** Once, at app start: brings back the last opens' log and starts catching errors. */
export function installAppLog() {
  if (installed) return;
  installed = true;
  setLogSink(keep);

  void (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as LogEntry[]) : [];
      let merged: LogEntry[] = [];
      for (const e of [...saved, ...entries]) merged = addEntry(merged, e);
      entries = merged;
      emit();
    } catch {
      // A broken saved log starts over.
    }
  })();

  log('app', `opened · ${phoneDetails().join(' · ')}`);

  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void; setGlobalHandler: (fn: (error: unknown, isFatal?: boolean) => void) => void };
    HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, error: unknown) => void }) => void };
  };
  const previous = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((error, isFatal) => {
    log('crash', `${isFatal ? 'Closed the app: ' : ''}${describeError(error)}`, 'error');
    previous?.(error, isFatal);
  });

  // In a release build nothing else watches for a promise that failed with nobody listening.
  if (!__DEV__) {
    try {
      g.HermesInternal?.enablePromiseRejectionTracker?.({
        allRejections: true,
        onUnhandled: (_id, error) => log('crash', `Unhandled: ${describeError(error)}`, 'error'),
      });
    } catch {
      // Not on this engine.
    }
  }

  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        log('console', args.map((a) => (typeof a === 'string' ? a : describeError(a))).join(' '), level);
      } catch {
        // Never let the log break a warning.
      }
      original(...args);
    };
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useAppLog(): LogEntry[] {
  return useSyncExternalStore(subscribe, () => entries);
}

export function appLogText(): string {
  return formatLog(entries, phoneDetails());
}

export function clearAppLog() {
  entries = [];
  saveNow();
  emit();
  log('app', 'log cleared');
}
