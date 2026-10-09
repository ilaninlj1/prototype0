import { fromIndexRow, type SoundFeatures } from './sound.ts';

// assets/sound-index.json (scripts/build-sound-index.ts): catalog songs'
// ReccoBeats values, bundled so prints and More like this need no network.
// Plain Node (tests, scripts) has no `require` here, so it answers nothing there.
let songs: Record<string, unknown> | null = null;

export function soundFor(id: number): SoundFeatures | null {
  songs ??= typeof require === 'function' ? (require('../assets/sound-index.json') as { songs: Record<string, unknown> }).songs : {};
  const row = songs[String(id)];
  return row ? fromIndexRow(row) : null;
}
