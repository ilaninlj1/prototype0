import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ART,
  addMark,
  genreFamily,
  markSaved,
  markShapes,
  makePrint,
  pickInks,
  removeLastMark,
  slotPosition,
  threadPath,
  type ArtCanvas,
  type Mark,
} from './print.ts';

const hue = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};

test('makePrint: the same song always makes the same print', () => {
  const input = { id: 1599412344, genre: 'Pop', inks: null, durationMs: 245089, releaseYear: 2017 };
  assert.deepEqual(makePrint(input), makePrint(input));
  assert.notDeepEqual(makePrint(input).rotation, makePrint({ ...input, id: 42 }).rotation);
});

test('genreFamily: iTunes and Last.fm genre names pick a shape family', () => {
  assert.equal(genreFamily('Hip-Hop/Rap'), 'beat');
  assert.equal(genreFamily('trap'), 'beat');
  assert.equal(genreFamily('Electronic'), 'pulse');
  assert.equal(genreFamily('house'), 'pulse');
  assert.equal(genreFamily('Alternative'), 'edge');
  assert.equal(genreFamily('Metal'), 'edge');
  assert.equal(genreFamily('K-Pop'), 'bloom');
  assert.equal(genreFamily('R&B/Soul'), 'wave');
  assert.equal(genreFamily('Jazz'), 'wave');
  assert.equal(genreFamily('Singer/Songwriter'), 'grain');
  assert.equal(genreFamily('Latin'), 'shard');
  assert.equal(genreFamily('Afrobeats'), 'shard');
  assert.equal(genreFamily('Soundtrack'), 'arc');
  assert.equal(genreFamily(''), 'arc');
});

test('makePrint: longer songs make bigger marks; unknown length stays mid-size', () => {
  const short = makePrint({ id: 7, genre: 'Pop', durationMs: 120_000 });
  const long = makePrint({ id: 7, genre: 'Pop', durationMs: 420_000 });
  const unknown = makePrint({ id: 7, genre: 'Pop' });
  assert.ok(long.size > short.size);
  assert.ok(unknown.size > short.size && unknown.size < long.size);
});

test('makePrint: older songs print with the inks further out of register', () => {
  const at = (releaseYear: number) => {
    const p = makePrint({ id: 9, genre: 'Pop', releaseYear });
    return Math.hypot(p.offset.dx, p.offset.dy);
  };
  assert.ok(at(1968) > at(1995));
  assert.ok(at(1995) > at(2025));
});

test('pickInks: a red-and-blue cover gives a red ink and a blue ink, bright enough for navy', () => {
  const px: number[] = [];
  for (let i = 0; i < 18; i++) px.push(200, 30, 40, 255);
  for (let i = 0; i < 18; i++) px.push(20, 60, 190, 255);
  const [a, b] = pickInks(new Uint8Array(px))!;
  const hues = [hue(a), hue(b)].sort((x, y) => x - y);
  assert.ok(hues[0] < 20 || hues[1] > 340, `a red ink in ${hues}`);
  assert.ok(hues.some((h) => h > 200 && h < 250), `a blue ink in ${hues}`);
  assert.ok(lightness(a) >= 0.5 && lightness(b) >= 0.45);
});

test('pickInks: a black-and-white cover stays black-and-white', () => {
  const px: number[] = [];
  for (let i = 0; i < 36; i++) px.push(i % 2 ? 240 : 10, i % 2 ? 240 : 10, i % 2 ? 240 : 10, 255);
  const [a, b] = pickInks(new Uint8Array(px))!;
  for (const c of [a, b]) {
    const n = parseInt(c.slice(1), 16);
    const [r, g, bl] = [n >> 16, (n >> 8) & 255, n & 255];
    assert.ok(Math.max(r, g, bl) - Math.min(r, g, bl) < 40, `${c} should be grey`);
  }
});

test('slotPosition: each genre has its own height; the first mark sits in the middle and all 50 stay on the canvas, spread out', () => {
  const first = slotPosition(0, 'pulse');
  assert.ok(Math.abs(first.x - ART.width / 2) < 40 && Math.abs(first.y - ART.height / 2) < 40);
  const families = ['edge', 'beat', 'pulse', 'shard', 'bloom', 'wave', 'grain', 'arc'] as const;
  const pts = Array.from({ length: ART.slots }, (_, i) => slotPosition(i, families[i % 8], (i * 0.37) % 1));
  for (const p of pts) assert.ok(p.x > 30 && p.x < ART.width - 30 && p.y > 30 && p.y < ART.height - 30);
  // The first few land in different thirds of the canvas, so 3 swipes already look composed.
  const thirds = new Set(pts.slice(0, 3).map((p) => Math.floor((p.x / ART.width) * 3)));
  assert.equal(thirds.size, 3);
});

test('markShapes: a skipped song is one faint outline; a revealed one is two inks', () => {
  const print = makePrint({ id: 5, genre: 'Pop', inks: ['#e0a040', '#4080e0'] });
  const ghost = markShapes({ trackId: 5, kind: 'ghost', saved: false, print }, 500, 120);
  const bold = markShapes({ trackId: 5, kind: 'bold', saved: false, print }, 500, 120);
  assert.ok(ghost.every((s) => s.opacity <= 0.3 && !s.fill));
  assert.ok(bold.some((s) => s.fill === '#e0a040' || s.stroke === '#e0a040'));
  assert.ok(bold.some((s) => s.fill === '#4080e0' || s.stroke === '#4080e0'));
  for (const s of [...ghost, ...bold]) assert.ok(!s.d.includes('NaN'));
});

test('markShapes: every genre family draws valid paths, and a save adds a red dot', () => {
  for (const genre of ['Rap', 'Electronic', 'Rock', 'Pop', 'Soul', 'Folk', 'Latin', 'Classical']) {
    const print = makePrint({ id: 11, genre });
    const shapes = markShapes({ trackId: 11, kind: 'bold', saved: true, print }, 300, 100);
    assert.ok(shapes.length >= 2, genre);
    for (const s of shapes) assert.match(s.d, /^M[-\d.]/, genre);
    assert.ok(shapes.some((s) => s.fill === '#e63946'), `${genre} saved dot`);
  }
});

test('threadPath: nothing to draw for fewer than two points, a smooth curve for more', () => {
  assert.equal(threadPath([{ x: 1, y: 1 }]), '');
  const d = threadPath([
    { x: 0, y: 0 },
    { x: 100, y: 50 },
    { x: 200, y: 0 },
  ]);
  assert.match(d, /^M0 0 C/);
});

test('addMark: the 50th swipe finishes the piece and starts a clean canvas', () => {
  const print = makePrint({ id: 1, genre: 'Pop' });
  let canvas: ArtCanvas = { number: 1, startedAt: 0, marks: [] };
  let finished: ArtCanvas | null = null;
  for (let i = 0; i < ART.slots; i++) {
    const out = addMark(canvas, { trackId: i, kind: i % 2 ? 'bold' : 'ghost', saved: false, print }, 1000 + i);
    canvas = out.canvas;
    finished = out.finished ?? finished;
    if (i < ART.slots - 1) assert.equal(out.finished, undefined);
  }
  assert.equal(finished!.marks.length, 50);
  assert.equal(finished!.number, 1);
  assert.equal(canvas.marks.length, 0);
  assert.equal(canvas.number, 2);
});

test('addMark: the same song is only marked once per canvas', () => {
  const print = makePrint({ id: 1, genre: 'Pop' });
  const m: Mark = { trackId: 1, kind: 'ghost', saved: false, print };
  const once = addMark({ number: 1, startedAt: 0, marks: [] }, m, 0).canvas;
  assert.equal(addMark(once, { ...m, kind: 'bold' }, 0).canvas.marks.length, 1);
});

test('removeLastMark: undo takes back the last mark only if it is that song', () => {
  const print = makePrint({ id: 1, genre: 'Pop' });
  const canvas: ArtCanvas = {
    number: 1,
    startedAt: 0,
    marks: [
      { trackId: 1, kind: 'bold', saved: false, print },
      { trackId: 2, kind: 'ghost', saved: false, print },
    ],
  };
  assert.equal(removeLastMark(canvas, 2).marks.length, 1);
  assert.equal(removeLastMark(canvas, 1).marks.length, 2);
});

test('markSaved: a later double-tap puts the red dot on a song already on the canvas', () => {
  const print = makePrint({ id: 1, genre: 'Pop' });
  const canvas: ArtCanvas = { number: 1, startedAt: 0, marks: [{ trackId: 1, kind: 'bold', saved: false, print }] };
  assert.equal(markSaved(canvas, 1).marks[0].saved, true);
  assert.equal(markSaved(canvas, 99), canvas);
});

test('slotPosition: a genre always sits at the same height, whatever the order', () => {
  assert.equal(slotPosition(3, 'beat').y, slotPosition(40, 'beat').y);
  assert.notEqual(slotPosition(3, 'beat').y, slotPosition(3, 'wave').y);
});
