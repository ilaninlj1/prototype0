import AsyncStorage from '@react-native-async-storage/async-storage';

import { EMPTY_PROFILE, type RunProfile, type RunRecord, withKnockDefault } from './run-types';

// Runs stay on the phone: location never leaves it. Best-effort like discovery-storage.ts.
const RUNS_KEY = 'blindspotDiscovery:runs';
const PROFILE_KEY = 'blindspotDiscovery:runProfile';
const KEEP = 50;

export async function loadRuns(): Promise<RunRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(RUNS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadRun(id: string): Promise<RunRecord | null> {
  return (await loadRuns()).find((r) => r.id === id) ?? null;
}

/** Adds or replaces a run by id, newest first, keeping the last 50. */
export async function saveRun(run: RunRecord): Promise<void> {
  try {
    const runs = (await loadRuns()).filter((r) => r.id !== run.id);
    runs.unshift(run);
    runs.sort((a, b) => b.startedAt - a.startedAt);
    await AsyncStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, KEEP)));
  } catch {
    // ignore
  }
}

export async function loadRunProfile(): Promise<RunProfile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? withKnockDefault({ ...EMPTY_PROFILE, ...JSON.parse(raw) }) : EMPTY_PROFILE;
  } catch {
    return EMPTY_PROFILE;
  }
}

export async function saveRunProfile(profile: RunProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}
