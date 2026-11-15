// Coral's sound: turns a finger on a branch into the shared player's two-song crossfade.
// It only decides which of the two players holds which song; the fade itself is lib/playback-crossfade.ts.
// Spec: docs/superpowers/specs/2026-11-15-coral-design.md.

import type { CoralBlend, CoralSong } from './coral-types.ts';
import type { createPlaybackCrossfade } from './playback-crossfade.ts';

type Crossfade = ReturnType<typeof createPlaybackCrossfade>;

/** Optional player queries let Coral replay ended clips and release toward the song actually heard. */
export type CoralPlayback = Pick<
  Crossfade,
  'playPreview' | 'peekLoad' | 'setMix' | 'promotePeek' | 'cancelPeek' | 'stopPreview'
> &
  Partial<Pick<Crossfade, 'currentDone' | 'peekLouder'>>;

/** Timers for the short ease on release. Tests pass a fake one. */
export type CoralClock = {
  now: () => number;
  later: (callback: () => void, ms: number) => unknown;
  cancel: (id: unknown) => void;
};

export const RELEASE_EASE_MS = 180;
const EASE_STEP_MS = 16;

const realClock: CoralClock = {
  now: () => Date.now(),
  later: (callback, ms) => setTimeout(callback, ms),
  cancel: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createCoralMix(playback: CoralPlayback, clock: CoralClock = realClock) {
  // What each player holds, as far as this controller has asked. Empty string means nothing.
  let currentUrl = '';
  let peekUrl = '';
  let peekStart = 0;
  // How much of the peek song is heard, 0 to 1, as last sent.
  let share = 0;
  // False after a release, a tap or a stop, so the next touch sends its mix even if the number is the same.
  let settled = false;
  let soloUrl = '';
  let timer: unknown;

  function stopEase() {
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
  }

  // A stopped player or a clip that ran out holds nothing worth keeping.
  function forgetIfDone() {
    if (!currentUrl || !playback.currentDone?.()) return;
    currentUrl = '';
    peekUrl = '';
    share = 0;
    settled = false;
  }

  function play(url: string, startAt: number) {
    playback.playPreview(url || undefined, startAt);
    currentUrl = url;
    peekUrl = '';
    peekStart = 0;
    share = 0;
    settled = false;
  }

  // The peek song takes over without a gap. False when it isn't actually sounding yet.
  function promote(): boolean {
    if (!peekUrl || !playback.promotePeek(peekUrl)) return false;
    // Home follows a promotion with playPreview of the same song, which the crossfade expects and ignores.
    // Without it, the next real playPreview of this song would be the one ignored.
    playback.playPreview(peekUrl);
    currentUrl = peekUrl;
    peekUrl = '';
    peekStart = 0;
    share = 0;
    settled = false;
    return true;
  }

  // Fades the rest of the way to the peek song, then hands it the main player.
  function easeToPeek(otherwise: () => void) {
    const from = share;
    const at = clock.now();
    settled = false;
    function step() {
      timer = undefined;
      const progress = Math.min(1, (clock.now() - at) / RELEASE_EASE_MS);
      share = from + (1 - from) * (1 - (1 - progress) ** 3);
      playback.setMix(share);
      if (progress < 1) timer = clock.later(step, EASE_STEP_MS);
      else if (!promote()) otherwise();
    }
    step();
  }

  function dropPeek() {
    playback.cancelPeek();
    share = 0;
    settled = false;
  }

  function touch(blend: CoralBlend) {
    const { link } = blend;
    const mix = blend.mix > 0 ? Math.min(1, blend.mix) : 0;
    const a = link.a.previewUrl;
    const b = link.b.previewUrl;
    stopEase();
    soloUrl = '';
    forgetIfDone();

    // The song that is already on the main player stays there, so it never restarts.
    let keepA: boolean;
    if (currentUrl && currentUrl === a) keepA = true;
    else if (currentUrl && currentUrl === b) keepA = false;
    else if ((peekUrl === a || peekUrl === b) && promote()) keepA = currentUrl === a;
    else {
      // Neither song is sounding: the one nearer the finger starts, at its own start point.
      keepA = !!a && (!b || mix < 0.5);
      play(keepA ? a : b, keepA ? link.startA : link.startB);
    }

    const other = keepA ? b : a;
    const otherStart = keepA ? link.startB : link.startA;
    if (peekUrl !== other || peekStart !== (other ? otherStart : 0)) {
      playback.peekLoad(other || undefined, otherStart);
      peekUrl = other;
      peekStart = other ? otherStart : 0;
      settled = false;
    }

    const next = keepA ? mix : 1 - mix;
    if (settled && next === share) return;
    share = next;
    settled = true;
    // Kept, so a song still loading comes in at this mix when it's ready.
    playback.setMix(share, true);
  }

  function solo(song: CoralSong) {
    const url = song.previewUrl;
    stopEase();
    forgetIfDone();
    // A second tap on the same song plays it again from the top.
    const again = soloUrl === url;
    soloUrl = url;
    if (!again && currentUrl === url) dropPeek();
    else if (!again && peekUrl === url) easeToPeek(() => play(url, 0));
    else play(url, 0);
  }

  function release() {
    stopEase();
    if (!currentUrl) return;
    const toPeek = playback.peekLouder?.() ?? (share > 0.5);
    if (peekUrl && toPeek) easeToPeek(dropPeek);
    else dropPeek();
  }

  function stop() {
    stopEase();
    playback.stopPreview();
    currentUrl = '';
    peekUrl = '';
    peekStart = 0;
    share = 0;
    settled = false;
    soloUrl = '';
  }

  return { touch, solo, release, stop };
}
