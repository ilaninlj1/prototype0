import { MIX_CANCEL_MS, MIX_START_THRESHOLD, mixVolumes } from './crossfade.ts';

export type CrossfadePlayer = {
  playing: boolean;
  isLoaded: boolean;
  volume: number;
  play: () => void;
  pause: () => void;
  replace: (url: string) => void;
  seekTo: (seconds: number) => Promise<void>;
  // Only read by currentDone, so a player without them just never reports an ended clip.
  currentTime?: number;
  duration?: number;
};

type FrameClock = {
  now: () => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
};

export function createPlaybackCrossfade<Player extends CrossfadePlayer>(
  first: Player,
  second: Player,
  onPromote: (player: Player) => void,
  clock: FrameClock
) {
  let current = first;
  let peek = second;
  let peekUrl: string | undefined;
  let promotedUrl: string | undefined;
  let active = false;
  let held = false;
  let mix = 0;
  let started = false;
  let frame: number | undefined;
  let rewind: Promise<void> | undefined;
  // Start points, for screens that bring a song in partway through its clip. Home leaves them all at 0.
  let peekStart = 0;
  let peekCue = false;
  let currentCue: number | undefined;
  let cueing: Promise<void> | undefined;
  // A mix that must survive the current song still loading, so a finger held still isn't left on one song.
  let wanted: number | undefined;

  function stopFade() {
    if (frame !== undefined) clock.cancelFrame(frame);
    frame = undefined;
  }

  function applyVolumes() {
    const volumes = mixVolumes(mix);
    current.volume = volumes.current;
    peek.volume = volumes.next;
  }

  function resetPeek() {
    stopFade();
    mix = 0;
    current.volume = 1;
    peek.volume = 0;
    peek.pause();
    if (!started) return;
    started = false;
    const pending = peek.seekTo(peekStart);
    rewind = pending;
    function ready() {
      if (rewind !== pending) return;
      rewind = undefined;
      refresh();
    }
    void pending.then(ready, () => {
      if (rewind !== pending) return;
      if (peekUrl) peek.replace(peekUrl);
      peekCue = peekStart > 0;
      peek.volume = 0;
      ready();
    });
  }

  // A seek only sticks once the clip has loaded, so a current song with a start point waits, moves, then plays.
  function cueCurrent() {
    if (currentCue === undefined || !current.isLoaded) return;
    const player = current;
    const pending = player.seekTo(currentCue);
    currentCue = undefined;
    cueing = pending;
    function go() {
      if (cueing !== pending) return;
      cueing = undefined;
      player.play();
      refresh();
    }
    // A failed seek still plays, from the top: late is better than silent.
    void pending.then(go, go);
  }

  // The peek is moved to its start point while silent; the fade waits on `rewind` exactly as it does after a snap-back.
  function cuePeek() {
    if (!peekCue || !peekUrl || !peek.isLoaded || rewind) return;
    peekCue = false;
    const pending = peek.seekTo(peekStart);
    rewind = pending;
    function ready() {
      if (rewind !== pending) return;
      rewind = undefined;
      refresh();
    }
    void pending.then(ready, ready);
  }

  function refresh() {
    if (!active) return;
    cueCurrent();
    cuePeek();
    if (!current.playing || !peekUrl) {
      if (started || mix > 0) resetPeek();
      return;
    }
    if (frame !== undefined) return;
    if (wanted !== undefined) mix = wanted;
    if (!peek.isLoaded || rewind) {
      current.volume = 1;
      peek.volume = 0;
      return;
    }
    // A held Coral mix is deliberate even near an end; Home keeps its wobble threshold.
    if (!started && mix > (wanted === undefined ? MIX_START_THRESHOLD : 0)) {
      started = true;
      peek.play();
    }
    applyVolumes();
  }

  /** `startAt` is where the song comes in, in seconds. The same song at a new start point loads again. */
  function peekLoad(url: string | undefined, startAt = 0) {
    if (!active) return;
    const start = url && startAt > 0 ? startAt : 0;
    if (peekUrl === (url || undefined) && peekStart === start) return;
    resetPeek();
    rewind = undefined;
    wanted = undefined;
    peekUrl = url || undefined;
    peekStart = start;
    peekCue = start > 0;
    if (peekUrl) peek.replace(peekUrl);
    peek.volume = 0;
  }

  /** With `keep`, any positive mix starts the peek and survives either song loading. */
  function setMix(amount: number, keep = false) {
    if (!active) return;
    stopFade();
    mix = Math.max(0, Math.min(1, amount));
    wanted = keep ? mix : undefined;
    refresh();
  }

  function cancelPeek() {
    if (!active) return;
    wanted = undefined;
    if (frame !== undefined || (mix === 0 && !started)) return;
    if (!peek.isLoaded || rewind) {
      resetPeek();
      return;
    }
    const from = mix;
    const at = clock.now();
    function tick() {
      const progress = Math.min(1, (clock.now() - at) / MIX_CANCEL_MS);
      mix = from * (1 - progress) ** 3;
      applyVolumes();
      if (progress === 1) resetPeek();
      else frame = clock.requestFrame(tick);
    }
    frame = clock.requestFrame(tick);
  }

  function promotePeek(url: string | undefined): boolean {
    if (!active || !url || url !== peekUrl || !current.playing || !started || !peek.playing || !peek.isLoaded) return false;
    stopFade();
    const outgoing = current;
    current = peek;
    peek = outgoing;
    current.volume = 1;
    peek.pause();
    peek.volume = 0;
    mix = 0;
    started = false;
    rewind = undefined;
    peekUrl = undefined;
    peekStart = 0;
    peekCue = false;
    wanted = undefined;
    promotedUrl = url;
    onPromote(current);
    return true;
  }

  /** The next song loads but waits for a tap. One song only, so everything after it plays as usual. */
  function holdNext() {
    held = true;
  }

  /** `startAt` is where the song starts, in seconds. It then plays once it has loaded and moved there. */
  function playPreview(url: string | undefined, startAt = 0) {
    active = true;
    if (url && url === promotedUrl) {
      promotedUrl = undefined;
      return;
    }
    promotedUrl = undefined;
    resetPeek();
    clearCues();
    peekUrl = undefined;
    current.pause();
    if (url) {
      current.replace(url);
      current.volume = 1;
      if (held) held = false;
      else if (startAt > 0) {
        currentCue = startAt;
        cueCurrent();
      }
      else current.play();
    }
  }

  function clearCues() {
    peekStart = 0;
    peekCue = false;
    currentCue = undefined;
    cueing = undefined;
    wanted = undefined;
  }

  /** True when nothing is playing and nothing is on its way: stopped, or the current clip ran out. */
  function currentDone(): boolean {
    if (!active) return true;
    if (current.playing || currentCue !== undefined || cueing) return false;
    const length = current.duration ?? 0;
    return length > 0 && (current.currentTime ?? 0) >= length - 0.25;
  }

  /** Release follows what is audible, even when the requested mix is still loading. */
  function peekLouder(): boolean {
    return active && started && peek.isLoaded && peek.playing &&
      peek.volume > (current.playing ? current.volume : 0);
  }

  function stopPreview() {
    if (!active) return;
    active = false;
    resetPeek();
    rewind = undefined;
    clearCues();
    peekUrl = undefined;
    promotedUrl = undefined;
    current.pause();
  }

  return { peekLoad, setMix, cancelPeek, promotePeek, playPreview, stopPreview, refresh, holdNext, currentDone, peekLouder };
}
