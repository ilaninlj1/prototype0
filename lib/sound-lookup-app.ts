import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { createSoundLookup } from './sound-lookup';
import type { SoundRecord } from './sound';

const KEY = 'blindspot:sound:v1';

/** Every cached lookup by track id, measured or not. The Dark Map places heard songs that aren't in the index from it. */
export async function loadSoundRecords(): Promise<Record<number, SoundRecord>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Record<number, SoundRecord>;
  } catch {
    return {};
  }
}

export const soundLookup = createSoundLookup({
  // Deezer sends no CORS headers, so on web only the bundled index answers.
  fetch: Platform.OS === 'web' ? ((async () => new Response(null, { status: 503 })) as typeof fetch) : fetch,
  read: async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Record<number, SoundRecord>,
  write: (all) => AsyncStorage.setItem(KEY, JSON.stringify(all)),
  now: Date.now,
});
