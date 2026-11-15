import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCoralMix, RELEASE_EASE_MS } from './coral-mix.ts';
import type { CoralLink, CoralSong } from './coral-types.ts';
import { MIX_CANCEL_MS, mixVolumes } from './crossfade.ts';
import { createPlaybackCrossfade } from './playback-crossfade.ts';

const song = (trackId: number): CoralSong => ({
  trackId, trackName: `Song ${trackId}`, artistName: 'Artist', previewUrl: `clip:${trackId}`, color: '#40b8a0',
});
const a = song(1), b = song(2), c = song(3);
const link = (a: CoralSong, b: CoralSong, startA = 0, startB = 0): CoralLink => ({
  id: `${a.trackId}-${b.trackId}`, a, b, type: 'fade', startA, startB, createdAt: 0,
});
const ab = link(a, b);
const bc = link(b, c);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function fakePlayer() {
  return {
    playing: false,
    isLoaded: true,
    loadImmediately: true,
    playRequested: false,
    volume: 1,
    currentTime: 0,
    duration: 30,
    source: '',
    plays: 0,
    replaces: 0,
    seeks: [] as number[],
    play() { this.playRequested = true; this.playing = this.isLoaded; this.plays++; },
    pause() { this.playRequested = false; this.playing = false; },
    replace(url: string) {
      this.source = url;
      this.currentTime = 0;
      this.playing = false;
      this.playRequested = false;
      this.isLoaded = this.loadImmediately;
      this.replaces++;
    },
    async seekTo(time: number) { this.currentTime = time; this.seeks.push(time); },
    ready() { this.isLoaded = true; this.playing = this.playRequested; },
  };
}

function setup() {
  const main = fakePlayer(), peek = fakePlayer();
  let time = 0, id = 0;
  const tasks = new Map<number, { at: number; run: () => void }>();
  const later = (run: () => void, delay: number) => { tasks.set(++id, { at: time + delay, run }); return id; };
  const cancel = (key: unknown) => { tasks.delete(key as number); };
  const promoted: ReturnType<typeof fakePlayer>[] = [];
  const fade = createPlaybackCrossfade(main, peek, (player) => promoted.push(player), {
    now: () => time, requestFrame: (run) => later(run, 16), cancelFrame: cancel,
  });
  const coral = createCoralMix(fade, { now: () => time, later, cancel });
  function advance(ms: number) {
    time += ms;
    const due = [...tasks].filter(([, task]) => task.at <= time);
    for (const [key, task] of due) {
      if (tasks.delete(key)) task.run();
    }
  }
  function forSong(song: CoralSong) {
    const found = [main, peek].find((p) => p.source === song.previewUrl);
    assert.ok(found, `${song.trackName} is loaded`);
    return found;
  }
  function volumes(link: CoralLink, mix: number) {
    const want = mixVolumes(mix);
    near(forSong(link.a).volume, want.current);
    near(forSong(link.b).volume, want.next);
    if (want.current > 0) assert.equal(forSong(link.a).playing, true, 'a is audible');
    if (want.next > 0) assert.equal(forSong(link.b).playing, true, 'b is audible');
  }
  return { main, peek, fade, coral, advance, promoted, tasks, forSong, volumes };
}

for (const mix of [0, 0.5, 1]) {
  test(`touch can start at ${mix} of a branch`, () => {
    const { coral, volumes } = setup();
    coral.touch({ link: ab, mix });
    volumes(ab, mix);
  });
}

test('volumes follow mixVolumes through the whole branch, including small mixes', () => {
  const { coral, volumes } = setup();
  for (const mix of [0, 0.01, 0.05, 0.1, 0.3, 0.5, 0.75, 1, 0.9, 0.2, 0]) {
    coral.touch({ link: ab, mix });
    volumes(ab, mix);
  }
});

test('a-b to b-c keeps b playing, and going back brings a in again', async () => {
  const { coral, forSong, volumes } = setup();
  const offsetAB = link(a, b, 4, 8);
  const offsetBC = link(b, c, 12, 16);
  coral.touch({ link: offsetAB, mix: 0.2 });
  await flush();
  coral.touch({ link: offsetAB, mix: 1 });
  const shared = forSong(b);
  shared.currentTime = 11;
  const before = { plays: shared.plays, replaces: shared.replaces, seeks: [...shared.seeks] };
  coral.touch({ link: offsetBC, mix: 0 });
  await flush();
  coral.touch({ link: offsetBC, mix: 0.4 });
  volumes(offsetBC, 0.4);
  coral.touch({ link: offsetBC, mix: 0 });
  coral.touch({ link: offsetAB, mix: 1 });
  await flush();
  coral.touch({ link: offsetAB, mix: 0.25 });
  volumes(offsetAB, 0.25);
  assert.equal(shared.currentTime, 11);
  assert.deepEqual({ plays: shared.plays, replaces: shared.replaces, seeks: shared.seeks }, before);
  assert.equal(forSong(a).currentTime, 4);
});

test('a link entered from its b end uses the reverse player assignment', async () => {
  const { coral, forSong, volumes } = setup();
  const offset = link(a, b, 7, 13);
  coral.touch({ link: offset, mix: 1 });
  await flush();
  assert.equal(forSong(b).currentTime, 13);
  const plays = forSong(b).plays;
  forSong(b).currentTime = 18;
  coral.touch({ link: offset, mix: 0.3 });
  await flush();
  volumes(offset, 0.3);
  assert.equal(forSong(a).currentTime, 7);
  assert.equal(forSong(b).currentTime, 18);
  assert.equal(forSong(b).plays, plays);
});

test('repeated touches with the same songs do not reload, seek or restart them', async () => {
  const { main, peek, coral } = setup();
  const offset = link(a, b, 4, 9);
  coral.touch({ link: offset, mix: 0.4 });
  await flush();
  const counts = () => [main, peek].map((p) => ({ replaces: p.replaces, plays: p.plays, seeks: [...p.seeks] }));
  const before = counts();
  for (const mix of [0.4, 0.4, 0.7, 1, 0.3, 0, 0.9]) coral.touch({ link: { ...offset }, mix });
  assert.deepEqual(counts(), before);
});

test('a loading incoming song joins the held mix at its start point when ready', async () => {
  const { coral, fade, peek, main, volumes } = setup();
  peek.loadImmediately = false;
  coral.touch({ link: link(a, b, 0, 11), mix: 0.3 });
  assert.equal(main.volume, 1);
  assert.equal(peek.plays, 0);
  assert.deepEqual(peek.seeks, []);
  peek.ready();
  fade.refresh();
  await flush();
  volumes(ab, 0.3);
  assert.equal(peek.currentTime, 11);
});

test('a song without a preview does not prevent its playable partner from starting', () => {
  for (const mix of [0, 0.5, 1]) {
    const { coral, forSong } = setup();
    coral.touch({ link: link({ ...a, previewUrl: '' }, b), mix });
    assert.equal(forSong(b).playing, true);
    assert.equal(forSong(b).volume, 1);
  }
});

for (const offset of [0, 5]) {
  test(`a loading current song preserves a held touch, start ${offset}`, async () => {
    const { main, coral, fade, volumes } = setup();
    main.loadImmediately = false;
    coral.touch({ link: link(a, b, offset, 9), mix: 0.25 });
    await flush();
    assert.equal(main.playing, false);
    main.ready();
    fade.refresh();
    await flush();
    volumes(ab, 0.25);
    assert.equal(main.currentTime, offset);
  });
}

test('solo keeps the current song, promotes the incoming song and can replay a tapped song', async () => {
  const { coral, forSong, advance } = setup();
  coral.touch({ link: ab, mix: 0.3 });
  const first = forSong(a);
  first.currentTime = 6;
  coral.solo(a);
  advance(MIX_CANCEL_MS);
  await flush();
  assert.equal(first.currentTime, 6);
  assert.equal(first.plays, 1);
  assert.equal(first.volume, 1);
  assert.equal(forSong(b).playing, false);
  coral.touch({ link: ab, mix: 0.6 });
  forSong(b).currentTime = 8;
  coral.solo(b);
  advance(RELEASE_EASE_MS);
  assert.equal(forSong(b).currentTime, 8);
  assert.equal(forSong(b).volume, 1);
  assert.equal(first.playing, false);
  const replaces = forSong(b).replaces;
  coral.solo(b);
  assert.equal(forSong(b).replaces, replaces + 1);
  assert.equal(forSong(b).currentTime, 0);
  coral.solo(c);
  assert.equal(forSong(c).playing, true);
  assert.equal(forSong(c).volume, 1);
});

for (const mix of [0.3, 0.7]) {
  test(`release at ${mix} eases to the louder song without restarting it`, async () => {
    const { coral, forSong, advance, tasks } = setup();
    coral.touch({ link: ab, mix: 0 });
    coral.touch({ link: ab, mix });
    const loud = forSong(mix > 0.5 ? b : a);
    const quiet = forSong(mix > 0.5 ? a : b);
    loud.currentTime = 10;
    const plays = loud.plays, before = loud.volume;
    coral.release();
    advance(80);
    assert.ok(loud.volume > before && loud.volume < 1);
    assert.ok(quiet.volume > 0);
    advance(200);
    await flush();
    assert.equal(loud.volume, 1);
    assert.equal(loud.currentTime, 10);
    assert.equal(loud.plays, plays);
    assert.equal(quiet.playing, false);
    assert.equal(quiet.volume, 0);
    assert.equal(tasks.size, 0);
    coral.touch({ link: ab, mix: 0.4 });
    await flush();
    assert.equal(forSong(a).playing, true);
    assert.equal(forSong(b).playing, true);
  });
}

test('release cannot promote a song that is still loading', async () => {
  const { coral, fade, peek, main, advance } = setup();
  peek.loadImmediately = false;
  coral.touch({ link: ab, mix: 0 });
  coral.touch({ link: ab, mix: 0.9 });
  coral.release();
  advance(200);
  await flush();
  peek.ready();
  fade.refresh();
  assert.equal(main.volume, 1);
  assert.equal(main.playing, true);
  assert.equal(peek.playing, false);
});

test('release keeps the audible song if the silent incoming song loads during the ease', async () => {
  const { coral, fade, peek, main, advance } = setup();
  peek.loadImmediately = false;
  coral.touch({ link: ab, mix: 0 });
  coral.touch({ link: ab, mix: 0.9 });
  coral.release();
  advance(80);
  peek.ready();
  fade.refresh();
  await flush();
  advance(200);
  await flush();
  assert.equal(main.volume, 1);
  assert.equal(main.playing, true);
  assert.equal(peek.playing, false);
});

test('a new touch cancels release and stop leaves the shared player ready for Home', async () => {
  const { coral, fade, main, peek, advance, volumes, tasks } = setup();
  coral.touch({ link: ab, mix: 0 });
  coral.touch({ link: ab, mix: 0.8 });
  coral.release();
  advance(80);
  coral.touch({ link: ab, mix: 0.4 });
  advance(300);
  volumes(ab, 0.4);
  coral.release();
  coral.stop();
  await flush();
  advance(300);
  assert.equal(main.playing, false);
  assert.equal(peek.playing, false);
  assert.equal(tasks.size, 0);
  fade.playPreview('home');
  fade.peekLoad('next-home');
  fade.setMix(0.1);
  assert.equal(peek.playing, false);
  fade.setMix(0.6);
  near(main.volume, mixVolumes(0.6).current);
  near(peek.volume, mixVolumes(0.6).next);
  peek.currentTime = 3;
  assert.equal(fade.promotePeek('next-home'), true);
  fade.playPreview('next-home');
  assert.equal(peek.currentTime, 3);
});

test('a touch can replay an ended clip', () => {
  const { coral, forSong } = setup();
  coral.touch({ link: ab, mix: 0 });
  const first = forSong(a);
  first.currentTime = 30;
  first.playing = false;
  coral.touch({ link: ab, mix: 0 });
  assert.equal(first.currentTime, 0);
  assert.equal(first.plays, 2);
});

// Test the optional crossfade APIs here so Home's existing test files stay untouched.
test('crossfade starts a loaded current clip at its offset without needing another gesture', async () => {
  const { main, fade } = setup();
  fade.playPreview('current', 6);
  await flush();
  assert.equal(main.currentTime, 6);
  assert.equal(main.playing, true);
});

test('crossfade cues current and peek once, and snap-back rewinds to the chosen start', async () => {
  const { main, peek, fade, advance } = setup();
  fade.playPreview('current', 5);
  fade.peekLoad('incoming', 12);
  fade.setMix(0.4, true);
  await flush();
  assert.deepEqual(main.seeks, [5]);
  assert.deepEqual(peek.seeks, [12]);
  assert.equal(main.playing, true);
  assert.equal(peek.playing, true);
  fade.peekLoad('incoming', 12);
  assert.equal(peek.replaces, 1);
  fade.refresh();
  assert.deepEqual(peek.seeks, [12]);
  peek.currentTime = 20;
  fade.cancelPeek();
  advance(MIX_CANCEL_MS);
  await flush();
  assert.equal(peek.currentTime, 12);
  fade.setMix(0.4, true);
  assert.equal(peek.playing, true);
  fade.peekLoad('incoming', 16);
  fade.setMix(0.4, true);
  await flush();
  assert.equal(peek.replaces, 2);
  assert.equal(peek.currentTime, 16);
});

test('crossfade keeps only an opted-in mix while the current song is paused', async () => {
  for (const keep of [false, true]) {
    const { main, peek, fade } = setup();
    fade.playPreview('current');
    fade.peekLoad('incoming');
    main.pause();
    fade.setMix(0.7, keep);
    main.play();
    fade.refresh();
    await flush();
    assert.equal(peek.playing, keep);
    near(main.volume, keep ? mixVolumes(0.7).current : 1);
  }
});

test('crossfade cancellation forgets a held mix before either clip is ready', async () => {
  const { main, peek, fade, advance } = setup();
  main.loadImmediately = peek.loadImmediately = false;
  fade.playPreview('current', 5);
  fade.peekLoad('incoming', 8);
  fade.setMix(0.7, true);
  fade.cancelPeek();
  main.ready();
  peek.ready();
  fade.refresh();
  await flush();
  advance(300);
  assert.equal(main.volume, 1);
  assert.equal(peek.playing, false);
});

test('peekLouder reports audible volume, including loading, promotion and stop', () => {
  const { main, peek, fade } = setup();
  assert.equal(fade.peekLouder(), false);
  fade.playPreview('current');
  fade.peekLoad('incoming');
  peek.isLoaded = false;
  fade.setMix(0.9, true);
  assert.equal(fade.peekLouder(), false);
  peek.ready();
  fade.refresh();
  assert.equal(fade.peekLouder(), true);
  fade.setMix(0.2, true);
  assert.equal(fade.peekLouder(), false);
  main.pause();
  assert.equal(fade.peekLouder(), true);
  main.play();
  fade.setMix(0.8, true);
  assert.equal(fade.promotePeek('incoming'), true);
  assert.equal(fade.peekLouder(), false);
  fade.stopPreview();
  assert.equal(fade.peekLouder(), false);
});

test('crossfade ignores late cue completion after stop or replacement', async () => {
  for (const action of ['stop', 'replace'] as const) {
    const { main, peek, fade } = setup();
    let finishMain!: () => void, finishPeek!: () => void;
    main.seekTo = () => new Promise<void>((resolve) => { finishMain = resolve; });
    peek.seekTo = () => new Promise<void>((resolve) => { finishPeek = resolve; });
    fade.playPreview('current', 5);
    fade.peekLoad('incoming', 8);
    fade.setMix(0.4, true);
    if (action === 'stop') fade.stopPreview();
    else fade.playPreview('replacement');
    const plays = main.plays;
    finishMain();
    finishPeek();
    await flush();
    assert.equal(main.plays, plays);
    assert.equal(main.playing, action === 'replace');
    assert.equal(peek.playing, false);
  }
});

test('crossfade tolerates rejected start seeks without staying silent', async () => {
  const { main, peek, fade } = setup();
  main.seekTo = peek.seekTo = async () => { throw new Error('seek failed'); };
  fade.playPreview('current', 5);
  fade.peekLoad('incoming', 8);
  fade.setMix(0.4, true);
  await flush();
  assert.equal(main.playing, true);
  assert.equal(peek.playing, true);
  near(main.volume, mixVolumes(0.4).current);
  near(peek.volume, mixVolumes(0.4).next);
});

test('currentDone distinguishes stopped and ended clips from loading, cueing and paused ones', async () => {
  const { main, fade } = setup();
  assert.equal(fade.currentDone(), true);
  main.loadImmediately = false;
  fade.playPreview('current', 5);
  assert.equal(fade.currentDone(), false);
  let finish!: () => void;
  main.seekTo = () => new Promise<void>((resolve) => { finish = resolve; });
  main.ready();
  fade.refresh();
  assert.equal(fade.currentDone(), false);
  finish();
  await flush();
  assert.equal(fade.currentDone(), false);
  main.pause();
  main.currentTime = 10;
  assert.equal(fade.currentDone(), false);
  main.currentTime = 30;
  assert.equal(fade.currentDone(), true);
  fade.stopPreview();
  assert.equal(fade.currentDone(), true);
});

test('scrubbing a pulled song loads it once, then only moves it', async () => {
  const { coral, forSong, main, peek } = setup();
  coral.scrub(ab.a, 6);
  await Promise.resolve();
  const player = forSong(ab.a);
  const loads = main.replaces + peek.replaces;
  coral.scrub(ab.a, 9);
  coral.scrub(ab.a, 12.5);
  await Promise.resolve();
  assert.equal(main.replaces + peek.replaces, loads, 'no reload while scrubbing');
  assert.equal(player.playing, true);
  assert.equal(player.currentTime, 12.5);
});
