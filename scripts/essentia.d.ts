// essentia.js ships no type declarations for its package root ("essentia.js"
// import path resolves to dist/*.umd.js with no .d.ts wired up, only the
// unused core_api.d.ts) — this dev-only spike script needs a minimal ambient
// shim rather than none at all.
declare module "essentia.js" {
  export const EssentiaWASM: unknown;
  export class Essentia {
    constructor(wasmModule: unknown);
    arrayToVector(arr: Float32Array): { delete(): void };
    RhythmExtractor2013(vector: unknown): { bpm: number; confidence: number };
    Danceability(vector: unknown): { danceability: number };
    KeyExtractor(vector: unknown): { key: string; scale: string };
    DynamicComplexity(vector: unknown): { dynamicComplexity: number; loudness: number };
    delete(): void;
  }
}
