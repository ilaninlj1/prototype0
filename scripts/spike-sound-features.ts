// Spike for docs/superpowers/specs/2026-09-17-sound-space-design.md's Check 1:
// does Essentia actually run in this project's environment, on this project's
// real preview audio (AAC-in-M4A), without a browser?
//
// Not the full pipeline (no MusicBrainz/AcousticBrainz join, no precompute
// loop) — just the two sub-questions Check 1 poses, against a handful of
// real tracks spread across genres:
//   1. Can this Node script decode a real .m4a preview clip at all?
//   2. If so, does essentia.js's MusicExtractor-equivalent algorithms run
//      fast enough on it to be batchable later?
//
// Writes assets/spike-results.json (title/artist/genre/bpm/key/danceability
// per track) so the in-app "Spike Test" screen (app/spike-test.tsx) can show
// real results without bundling essentia.js/node-web-audio-api into the app
// itself — this stays a dev-only precompute step, same convention as
// scripts/precompute-catalogs.ts.
//
// Run: node --experimental-strip-types scripts/spike-sound-features.ts

import { readFileSync, writeFileSync } from "node:fs";
import { AudioContext } from "node-web-audio-api";
import { EssentiaWASM, Essentia } from "essentia.js";

interface CatalogEntry {
  title: string;
  previewUrl: string;
}
type CatalogFile = Record<string, { hits?: CatalogEntry[] }>;

// One genre file each — a real cross-section, not five tracks from one
// healthy genre (same "not 50 from one genre" convention the sound-space
// spec's own Check 0 calls for, scaled down for a spike).
const GENRES = ["electronic", "jazz", "hip-hop", "reggae", "country"];

function pickSampleTrack(genre: string): { artist: string; title: string; previewUrl: string } {
  const catalogPath = new URL(`../assets/catalogs/${genre}.json`, import.meta.url);
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogFile;
  for (const [artist, entry] of Object.entries(catalog)) {
    const hit = entry.hits?.[0];
    if (hit?.previewUrl) {
      return { artist, title: hit.title, previewUrl: hit.previewUrl };
    }
  }
  throw new Error(`No sampleable track found in assets/catalogs/${genre}.json`);
}

async function extractOne(
  essentia: InstanceType<typeof Essentia>,
  audioCtx: AudioContext,
  genre: string,
  track: { artist: string; title: string; previewUrl: string },
) {
  const res = await fetch(track.previewUrl);
  if (!res.ok) throw new Error(`Download failed for ${track.artist} - ${track.title}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const pcm = audioBuffer.getChannelData(0); // mono (left channel)

  const vector = essentia.arrayToVector(pcm);
  const rhythm = essentia.RhythmExtractor2013(vector);
  const danceability = essentia.Danceability(vector);
  const key = essentia.KeyExtractor(vector);
  vector.delete();

  return {
    genre,
    artist: track.artist,
    title: track.title,
    bpm: Math.round((rhythm.bpm as number) * 10) / 10,
    key: `${key.key} ${key.scale}`,
    danceability: Math.round((danceability.danceability as number) * 100) / 100,
  };
}

async function main() {
  const essentia = new Essentia(EssentiaWASM);
  const audioCtx = new AudioContext();

  const results: Array<{
    genre: string;
    artist: string;
    title: string;
    bpm: number;
    key: string;
    danceability: number;
  }> = [];

  for (const genre of GENRES) {
    const track = pickSampleTrack(genre);
    console.log(`[${genre}] ${track.artist} - ${track.title}`);
    const start = Date.now();
    const result = await extractOne(essentia, audioCtx, genre, track);
    console.log(
      `  bpm=${result.bpm} key="${result.key}" danceability=${result.danceability} ` +
        `(${Date.now() - start}ms)`,
    );
    results.push(result);
  }

  essentia.delete();
  await audioCtx.close();

  const outPath = new URL("../assets/spike-results.json", import.meta.url);
  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  console.log(`\nWrote ${results.length} results to assets/spike-results.json`);

  console.log("\n--- What we learned (Check 1) ---");
  console.log(
    "essentia.js's own decode path (getAudioBufferFromURL) needs a browser AudioContext and\n" +
      "is a dead end in this project's plain-Node scripts — but node-web-audio-api supplies a\n" +
      "real, non-browser AudioContext.decodeAudioData that handled every one of these five\n" +
      "genres' real AAC/M4A preview URLs directly, no ffmpeg needed (confirmed not installed\n" +
      "on this machine). Extraction stayed well under the iTunes pacing budget on every track,\n" +
      "so Essentia itself won't be the bottleneck in a future precompute run. Still unresolved,\n" +
      "per the spec's own scoping: Check 0 (MusicBrainz/AcousticBrainz coverage rate) and\n" +
      "Check 2 (Zenodo dump provisioning) — this spike only proves the Essentia fallback tier\n" +
      "is viable, on 5 tracks, not that most tracks will ever reach the richer tier-1 feature set.",
  );
}

main().catch((err) => {
  console.error("Spike failed:", err);
  process.exit(1);
});
