import { Platform } from 'react-native';

type RunNative = {
  sensors: typeof import('expo-sensors');
  location: typeof import('expo-location');
  keepAwake: typeof import('expo-keep-awake');
};

let cached: RunNative | null | undefined;

/**
 * The sensor, GPS and keep-awake modules, or null where they can't load: the web, and APKs built
 * before 1.0.4, which don't have them compiled in. Loaded lazily so the rest of the app never crashes there.
 */
export function runNative(): RunNative | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') return (cached = null);
  try {
    cached = {
      sensors: require('expo-sensors'),
      location: require('expo-location'),
      keepAwake: require('expo-keep-awake'),
    };
  } catch {
    cached = null;
  }
  return cached;
}
