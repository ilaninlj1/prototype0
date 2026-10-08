import { MIX_CANCEL_MS, MIX_START_THRESHOLD, mixVolumes } from './crossfade.ts';

export type CrossfadePlayer = {
  playing: boolean;
  isLoaded: boolean;
  volume: number;
  play: () => void;
  pause: () => void;
  replace: (url: string) => void;
  seekTo: (seconds: number) => Promise<void>;
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
  let mix = 0;
  let started = false;
  let frame: number | undefined;
  let rewind: Promise<void> | undefined;

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
    const pending = peek.seekTo(0);
    rewind = pending;
    function ready() {
      if (rewind !== pending) return;
      rewind = undefined;
      refresh();
    }
    void pending.then(ready, () => {
      if (rewind !== pending) return;
      if (peekUrl) peek.replace(peekUrl);
      peek.volume = 0;
      ready();
    });
  }

  function refresh() {
    if (!active) return;
    if (!current.playing || !peekUrl) {
      if (started || mix > 0) resetPeek();
      return;
    }
    if (frame !== undefined) return;
    if (!peek.isLoaded || rewind) {
      current.volume = 1;
      peek.volume = 0;
      return;
    }
    if (!started && mix > MIX_START_THRESHOLD) {
      started = true;
      peek.play();
    }
    applyVolumes();
  }

  function peekLoad(url: string | undefined) {
    if (!active) return;
    if (peekUrl === (url || undefined)) return;
    resetPeek();
    rewind = undefined;
    peekUrl = url || undefined;
    if (peekUrl) peek.replace(peekUrl);
    peek.volume = 0;
  }

  function setMix(amount: number) {
    if (!active) return;
    stopFade();
    mix = Math.max(0, Math.min(1, amount));
    refresh();
  }

  function cancelPeek() {
    if (!active || frame !== undefined || (mix === 0 && !started)) return;
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
    promotedUrl = url;
    onPromote(current);
    return true;
  }

  function playPreview(url: string | undefined) {
    active = true;
    if (url && url === promotedUrl) {
      promotedUrl = undefined;
      return;
    }
    promotedUrl = undefined;
    resetPeek();
    peekUrl = undefined;
    current.pause();
    if (url) {
      current.replace(url);
      current.volume = 1;
      current.play();
    }
  }

  function stopPreview() {
    if (!active) return;
    active = false;
    resetPeek();
    rewind = undefined;
    peekUrl = undefined;
    promotedUrl = undefined;
    current.pause();
  }

  return { peekLoad, setMix, cancelPeek, promotePeek, playPreview, stopPreview, refresh };
}
