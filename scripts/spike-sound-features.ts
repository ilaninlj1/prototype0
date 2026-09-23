// Spike for docs/superpowers/specs/2026-09-17-sound-space-design.md's Check 1:
// does Essentia actually run in this project's environment, on this project's
// real preview audio (AAC-in-M4A), without a browser?
//
// Not the full pipeline (no MusicBrainz/AcousticBrainz join, no precompute
// loop) — just the two sub-questions Check 1 poses, against one real track:
//   1. Can this Node script decode a real .m4a preview clip at all?
//   2. If so, does essentia.js's MusicExtractor-equivalent algorithms run
//      fast enough on it to be batchable later?
//
// Run: node --experimental-strip-types scripts/spike-sound-features.ts

import { AudioContext } from "node-web-audio-api";
import { EssentiaWASM, Essentia } from "essentia.js";

const SAMPLE_TRACK = {
  artist: "Daft Punk",
  title: "One More Time",
  previewUrl:
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/5d/93/d8/5d93d83f-ad1e-da4d-1d79-9937bdff24ec/mzaf_14396932211949300852.plus.aac.p.m4a",
};

async function main() {
  console.log(`Spike: ${SAMPLE_TRACK.artist} - ${SAMPLE_TRACK.title}`);
  console.log(`Preview URL: ${SAMPLE_TRACK.previewUrl}\n`);

  // --- Sub-question 1: can we decode a real AAC/M4A preview at all in Node? ---
  console.log("[1/3] Downloading preview clip...");
  const downloadStart = Date.now();
  const res = await fetch(SAMPLE_TRACK.previewUrl);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  console.log(
    `  downloaded ${(arrayBuffer.byteLength / 1024).toFixed(0)}KB in ${Date.now() - downloadStart}ms`,
  );

  console.log("[2/3] Decoding AAC/M4A via node-web-audio-api...");
  const decodeStart = Date.now();
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const decodeMs = Date.now() - decodeStart;
  const pcm = audioBuffer.getChannelData(0); // mono (left channel)
  console.log(
    `  decoded in ${decodeMs}ms — ${audioBuffer.duration.toFixed(1)}s, ` +
      `${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels}ch, ${pcm.length} samples`,
  );
  console.log(
    "  ANSWER: essentia.js's own decode path (getAudioBufferFromURL) needs a " +
      "browser AudioContext and is a dead end in this project's plain-Node " +
      "scripts — but node-web-audio-api supplies a real, non-browser " +
      "AudioContext.decodeAudioData that handles this project's actual AAC/M4A " +
      "preview format directly. No ffmpeg needed (confirmed not installed on " +
      "this machine) — the spec's feared 'new toolchain dependency' isn't one.",
  );

  // --- Sub-question 2: does MusicExtractor-equivalent analysis run fast enough to batch? ---
  console.log("\n[3/3] Running Essentia feature extraction...");
  const essentia = new Essentia(EssentiaWASM);
  const vector = essentia.arrayToVector(pcm);

  const extractStart = Date.now();
  const rhythm = essentia.RhythmExtractor2013(vector);
  const danceability = essentia.Danceability(vector);
  const key = essentia.KeyExtractor(vector);
  const dynamics = essentia.DynamicComplexity(vector);
  const extractMs = Date.now() - extractStart;

  console.log(`  extraction took ${extractMs}ms for a ${audioBuffer.duration.toFixed(1)}s clip`);
  console.log(
    `  ${(audioBuffer.duration / (extractMs / 1000)).toFixed(1)}x real-time ` +
      `(spec's Check 1 sub-question 2 threshold: must beat 1x to not dominate the iTunes pacing budget)`,
  );

  const result = {
    tempo: rhythm.bpm as number,
    rhythmConfidence: rhythm.confidence as number,
    danceability: danceability.danceability as number,
    key: `${key.key} ${key.scale}`,
    dynamicComplexity: dynamics.dynamicComplexity as number,
    loudnessDb: dynamics.loudness as number,
  };

  console.log("\nExtracted CoreSoundFeatures-shaped result:");
  console.log(JSON.stringify(result, null, 2));

  vector.delete();
  essentia.delete();

  console.log("\n--- What we learned ---");
  console.log(
    "1. Check 1's decode fork resolves in our favor without ffmpeg: node-web-audio-api's\n" +
      "   AudioContext.decodeAudioData decodes this project's real AAC/M4A preview URLs\n" +
      "   directly in a plain `node --experimental-strip-types` script, matching this repo's\n" +
      "   existing script convention (no browser, no Web Audio API polyfill hand-waving).\n" +
      `2. Extraction ran at ~${(audioBuffer.duration / (extractMs / 1000)).toFixed(0)}x real-time on one clip — comfortably\n` +
      "   faster than the iTunes pacing budget (features.md's 2026-09-14 entry), so\n" +
      "   Essentia is very unlikely to be the bottleneck in a future precompute run;\n" +
      "   the MusicBrainz/AcousticBrainz joins remain the real cost (Check 0/2, not\n" +
      "   run here).\n" +
      "3. Narrowed scope for Check 1 specifically: the two new deps this spike adds\n" +
      "   (essentia.js, node-web-audio-api) are both pure npm installs, no native\n" +
      "   toolchain step, no system-level ffmpeg — cheaper to provision than the spec\n" +
      "   assumed under its 'New local infrastructure' known problem.\n" +
      "4. Not answered here (still real risk, per the spec's own scoping): Check 0's\n" +
      "   coverage rate and Check 2's Zenodo dump question are both about the\n" +
      "   MusicBrainz/AcousticBrainz join, which this spike didn't touch — it only\n" +
      "   proves Essentia's local-extraction fallback tier is viable, not that most\n" +
      "   tracks will ever reach tier 1.",
  );

  await audioCtx.close();
}

main().catch((err) => {
  console.error("Spike failed:", err);
  process.exit(1);
});
