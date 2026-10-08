import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPlaybackCrossfade, type CrossfadePlayer } from './playback-crossfade.ts';

function fakePlayer() {
  return {
    playing: false,
    isLoaded: true,
    volume: 1,
    currentTime: 0,
    source: '',
    plays: 0,
    replaces: 0,
    seeks: [] as number[],
    play() { this.playing = true; this.plays++; },
    pause() { this.playing = false; },
    replace(url: string) { this.source = url; this.currentTime = 0; this.replaces++; },
    async seekTo(time: number) { this.currentTime = time; this.seeks.push(time); },
  };
}

function setup() {
  const main = fakePlayer();
  const peek = fakePlayer();
  let time = 0;
  let id = 0;
  const frames = new Map<number, () => void>();
  const promoted: CrossfadePlayer[] = [];
  const fade = createPlaybackCrossfade(main, peek, (player) => promoted.push(player), {
    now: () => time,
    requestFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelFrame: (frame) => { frames.delete(frame); },
  });
  function advance(ms: number) {
    time += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  }
  fade.playPreview('current');
  fade.peekLoad('next');
  return { main, peek, fade, advance, promoted, frames };
}

test('preloading stays silent and a wobble never starts the next song', () => {
  const { main, peek, fade } = setup();
  assert.equal(peek.source, 'next');
  assert.equal(peek.volume, 0);
  assert.equal(peek.plays, 0);
  fade.setMix(0.1);
  assert.equal(peek.plays, 0);
  fade.setMix(0.11);
  assert.equal(peek.plays, 1);
  assert.equal(peek.currentTime, 0);
  fade.setMix(0.5);
  assert.equal(peek.plays, 1);
  assert.ok(Math.abs(main.volume - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(peek.volume - Math.SQRT1_2) < 1e-12);
});

test('a paused current song or a missing next preview cannot crossfade', () => {
  const { main, peek, fade } = setup();
  main.pause();
  fade.setMix(0.8);
  assert.equal(main.volume, 1);
  assert.equal(peek.plays, 0);
  main.play();
  fade.peekLoad(undefined);
  fade.setMix(1);
  assert.equal(main.volume, 1);
  assert.equal(peek.plays, 0);
  assert.equal(fade.promotePeek('next'), false);
});

test('buffering does not fade into silence; readiness applies the latest drag', () => {
  const { main, peek, fade } = setup();
  peek.isLoaded = false;
  fade.setMix(0.7);
  assert.equal(main.volume, 1);
  assert.equal(peek.plays, 0);
  peek.isLoaded = true;
  fade.refresh();
  assert.equal(peek.plays, 1);
  assert.ok(main.volume < 1);
});

test('snap-back eases over 200ms, then pauses and rewinds the next song', async () => {
  const { main, peek, fade, advance } = setup();
  fade.setMix(0.8);
  peek.currentTime = 4;
  const before = main.volume;
  fade.cancelPeek();
  advance(100);
  assert.ok(main.volume > before && main.volume < 1);
  assert.ok(peek.volume > 0 && peek.playing);
  assert.equal(peek.currentTime, 4);
  advance(100);
  await Promise.resolve();
  assert.equal(main.volume, 1);
  assert.equal(peek.volume, 0);
  assert.equal(peek.playing, false);
  assert.equal(peek.currentTime, 0);
  fade.setMix(0.5);
  assert.equal(peek.playing, true);
  assert.equal(peek.currentTime, 0);
});

test('skip swaps roles without pausing, seeking or reloading the audible preview', () => {
  const { main, peek, fade, promoted } = setup();
  fade.setMix(0.6);
  peek.currentTime = 3.25;
  assert.equal(fade.promotePeek('next'), true);
  assert.equal(promoted[0], peek);
  assert.equal(main.playing, false);
  assert.equal(peek.playing, true);
  assert.equal(peek.volume, 1);
  fade.playPreview('next');
  assert.equal(peek.replaces, 1);
  assert.equal(peek.plays, 1);
  assert.deepEqual(peek.seeks, []);
  assert.equal(peek.currentTime, 3.25);
  fade.peekLoad('third');
  assert.equal(main.source, 'third');
  assert.equal(main.volume, 0);
  fade.setMix(0.6);
  main.currentTime = 2;
  assert.equal(fade.promotePeek('third'), true);
  fade.playPreview('third');
  assert.equal(promoted[1], main);
  assert.equal(main.currentTime, 2);
});

test('a tap or stale queue cannot promote an unstarted or mismatched preview', () => {
  const { fade, peek } = setup();
  assert.equal(fade.promotePeek('next'), false);
  fade.setMix(0.5);
  assert.equal(fade.promotePeek('different'), false);
  fade.playPreview('different');
  assert.equal(peek.playing, false);
});

test('promotion cancels a pending snap-back without later muting the new current song', () => {
  const { fade, peek, advance, frames } = setup();
  fade.setMix(0.5);
  fade.cancelPeek();
  advance(80);
  assert.equal(fade.promotePeek('next'), true);
  assert.equal(frames.size, 0);
  advance(200);
  assert.equal(peek.volume, 1);
  assert.equal(peek.playing, true);
});

test('a new drag interrupts snap-back at the new mix', () => {
  const { fade, peek, advance, frames } = setup();
  fade.setMix(0.8);
  fade.cancelPeek();
  advance(80);
  fade.setMix(0.5);
  advance(200);
  assert.equal(frames.size, 0);
  assert.equal(peek.playing, true);
  assert.ok(Math.abs(peek.volume - Math.SQRT1_2) < 1e-12);
});

test('queue replacement and focus loss stop the peek and cancel pending fades', () => {
  const { main, peek, fade, advance, frames } = setup();
  fade.setMix(0.7);
  fade.cancelPeek();
  fade.peekLoad('replacement');
  advance(300);
  assert.equal(peek.source, 'replacement');
  assert.equal(peek.playing, false);
  assert.equal(main.volume, 1);
  fade.setMix(0.7);
  fade.stopPreview();
  assert.equal(main.playing, false);
  assert.equal(main.volume, 1);
  assert.equal(peek.playing, false);
  assert.equal(peek.volume, 0);
  assert.equal(frames.size, 0);
  assert.equal(fade.promotePeek('replacement'), false);
});

test('pausing during a mix also silences the next song', () => {
  const { main, peek, fade } = setup();
  fade.setMix(0.5);
  main.pause();
  fade.refresh();
  assert.equal(peek.playing, false);
  assert.equal(main.volume, 1);
  assert.equal(peek.volume, 0);
});

test('a missing current preview and returning focus never resume a stale promotion', () => {
  const { main, peek, fade } = setup();
  fade.setMix(0.5);
  fade.promotePeek('next');
  fade.stopPreview();
  fade.playPreview('next');
  assert.equal(peek.replaces, 2);
  assert.equal(peek.currentTime, 0);
  fade.playPreview(undefined);
  assert.equal(main.playing, false);
  assert.equal(peek.playing, false);
});

test('cancelling before the next song loads never ducks the current song', () => {
  const { main, peek, fade, advance } = setup();
  peek.isLoaded = false;
  fade.setMix(0.8);
  fade.cancelPeek();
  advance(50);
  assert.equal(main.volume, 1);
  peek.isLoaded = true;
  fade.refresh();
  advance(200);
  assert.equal(peek.plays, 0);
  assert.equal(main.volume, 1);
});

test('a new drag waits for the rewind to finish, then starts from zero', async () => {
  const { peek, fade, advance } = setup();
  let finish!: () => void;
  peek.seekTo = () => new Promise<void>((resolve) => {
    finish = () => { peek.currentTime = 0; resolve(); };
  });
  fade.setMix(0.6);
  peek.currentTime = 8;
  fade.cancelPeek();
  advance(200);
  fade.setMix(0.5);
  assert.equal(peek.playing, false);
  finish();
  await Promise.resolve();
  assert.equal(peek.playing, true);
  assert.equal(peek.currentTime, 0);
});

test('late gesture and readiness callbacks after blur cannot restart either song', async () => {
  const { main, peek, fade, advance } = setup();
  fade.setMix(0.6);
  fade.cancelPeek();
  advance(200);
  fade.stopPreview();
  main.playing = true; // Another screen now owns the shared player.
  fade.peekLoad('stale');
  fade.setMix(0.7);
  fade.cancelPeek();
  await Promise.resolve();
  fade.refresh();
  advance(200);
  assert.equal(main.volume, 1);
  assert.equal(peek.playing, false);
  assert.equal(peek.source, 'next');
});
