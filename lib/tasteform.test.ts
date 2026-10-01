import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zlibSync, unzlibSync } from 'fflate';
import { coverColor, decodeTinyPng, tinyArtworkUrl } from './cover-color.ts';
import {
  bodyBreath,
  bodyPath,
  cellBreath,
  describeBreath,
  formLayout,
  formSongs,
  genreFamily,
  hexBlob,
  obscurity,
  type FormSong,
  type Mode,
} from './tasteform.ts';

const GENRES = ['Alternative', 'R&B/Soul', 'Electronic', 'Hip-Hop/Rap', 'Pop', 'Jazz'];
function songs(n: number): FormSong[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 1_000_000_000 + i * 7919,
    genre: GENRES[i % GENRES.length],
    listeners: [3_000_000, 400_000, 60_000, 8_000][i % 4],
    likedAt: Date.UTC(2026, 6 + (i % 3), 1 + i),
    color: { main: [200, 80, 60], hue: (i * 47) % 360, neutral: i % 9 === 0 },
    blind: i % 2 === 0,
    quick: i % 5 === 0,
  }));
}
const loops = (d: string) => (d.match(/M/g) ?? []).length;

test('formSongs: blind means saved from the blind card; quick means within 8s', () => {
  const track = (id: number) => ({
    id,
    trackName: '',
    artistId: 1,
    artistName: '',
    artworkUrl100: `a${id}`,
    primaryGenreName: 'Pop',
    previewUrl: '',
    trackViewUrl: '',
    collectionName: null,
    artistListeners: 5,
    likedAt: 9,
  });
  const like = (trackId: number, listenMs: number) => ({
    trackId,
    artistId: 1,
    genre: 'Pop',
    action: 'like' as const,
    timestamp: 1,
    listenMs,
  });
  const out = formSongs(
    [track(1), track(2), track(3)],
    [like(1, 3000), like(2, 20000)],
    { a1: { main: [1, 2, 3], hue: 0, neutral: false } },
    { 3: { energy: 0.7, valence: 0.5, tempo: 120 } }
  );
  assert.equal(out[2].energy, 0.7);
  assert.equal(out[0].energy, undefined);
  assert.deepEqual(
    out.map((s) => [s.blind, s.quick]),
    [
      [true, true],
      [true, false],
      [false, false],
    ]
  );
  assert.deepEqual(out[0].color?.main, [1, 2, 3]);
  assert.equal(out[1].color, undefined);
  assert.equal(out[0].listeners, 5);
});

test('breathing: calm saves breathe slow and shallow, intense ones quick and deep', () => {
  const withEnergy = (e: (number | undefined)[]) => songs(e.length).map((s, i) => ({ ...s, energy: e[i] }));
  const calm = bodyBreath(withEnergy([0.1, 0.1, 0.2]));
  const loud = bodyBreath(withEnergy([0.9, 0.8, 0.95]));
  assert.ok(calm.halfMs > loud.halfMs && calm.depth < loud.depth);
  assert.deepEqual(bodyBreath(withEnergy([undefined, undefined])), { halfMs: 2600, depth: 1.018 });
  assert.equal(cellBreath(undefined), null);
  assert.ok(cellBreath(0)!.halfMs > cellBreath(1)!.halfMs);
  assert.equal(describeBreath(withEnergy([0.1, undefined, 0.2])), null, 'needs 3 measured songs');
  assert.match(describeBreath(withEnergy([0.1, 0.2, 0.3]))!, /slowly/);
  assert.match(describeBreath(withEnergy([0.9, 0.8, 0.7]))!, /fast/);
});

test('obscurity: famous in the middle, rare at the edge, unknown halfway', () => {
  assert.equal(obscurity(10_000_000), 0);
  assert.equal(obscurity(500), 1);
  assert.equal(obscurity(undefined), 0.5);
  assert.ok(obscurity(50_000) > obscurity(500_000));
});

test('shape: a few saves huddle into one centered cell', () => {
  const form = formLayout(songs(3), 'shape', 340);
  assert.equal(form.cells.length, 3);
  const cx = form.cells.reduce((s, c) => s + c.x, 0) / 3;
  const cy = form.cells.reduce((s, c) => s + c.y, 0) / 3;
  assert.ok(Math.abs(cx - 170) < 20 && Math.abs(cy - 170) < 20, `centered, got ${cx},${cy}`);
  assert.equal(loops(bodyPath(form.cells, form.width, form.height)), 1);
});

test('shape: every cell stays on the canvas and covers never pile up', () => {
  for (const n of [1, 15, 50, 160]) {
    const form = formLayout(songs(n), 'shape', 340);
    for (const c of form.cells) {
      assert.ok(c.x - c.r >= 0 && c.x + c.r <= 340 && c.y - c.r >= 0 && c.y + c.r <= 340, `n=${n} cell off canvas`);
    }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const [a, b] = [form.cells[i], form.cells[j]];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.d * 0.9, `n=${n} covers overlap`);
      }
  }
});

test('shape: the same saves always make the same shape', () => {
  assert.deepEqual(formLayout(songs(30), 'shape', 340), formLayout(songs(30), 'shape', 340));
});

const withEnergy = (list: FormSong[], energy: (i: number) => number | undefined) => list.map((s, i) => ({ ...s, energy: energy(i) }));

test('buds: calm or unmeasured songs never sprout', () => {
  assert.deepEqual(formLayout(songs(30), 'shape', 340).buds, []);
  assert.deepEqual(formLayout(withEnergy(songs(30), () => 0.4), 'shape', 340).buds, []);
});

test('buds: the more energy a song has, the more it sprouts, up to 3', () => {
  const count = (e: number) => {
    const form = formLayout(withEnergy(songs(1), () => e), 'shape', 340);
    return form.buds.filter((b) => b.parent === form.cells[0].id).length;
  };
  assert.equal(count(0.6), 1);
  assert.equal(count(0.75), 2);
  assert.equal(count(0.95), 3);
});

test('buds: small, outside their own cell, on the canvas, and the same every time', () => {
  for (const n of [1, 15, 50]) {
    const list = withEnergy(songs(n), (i) => (i % 3 === 0 ? 0.9 : 0.3));
    const form = formLayout(list, 'shape', 340);
    assert.ok(form.buds.length > 0, `n=${n} has buds`);
    const cellOf = new Map(form.cells.map((c) => [c.id, c]));
    for (const b of form.buds) {
      const c = cellOf.get(b.parent)!;
      assert.ok(b.r < c.r * 0.5, 'a bud is small next to its cell');
      assert.ok(Math.hypot(b.x - c.x, b.y - c.y) > c.r, 'a bud sits outside its cell');
      assert.ok(b.x - b.r >= 0 && b.x + b.r <= 340 && b.y - b.r >= 0 && b.y + b.r <= 340, `n=${n} bud off canvas`);
    }
    assert.deepEqual(formLayout(list, 'shape', 340).buds, form.buds);
  }
});

test('buds: measuring energy never moves the cells', () => {
  const calm = formLayout(songs(20), 'shape', 340);
  const loud = formLayout(withEnergy(songs(20), () => 0.9), 'shape', 340);
  assert.deepEqual(loud.cells, calm.cells);
});

test('buds: only the Shape view sprouts', () => {
  const list = withEnergy(songs(20), () => 0.9);
  for (const mode of ['genre', 'listeners', 'color', 'when'] as Mode[]) assert.deepEqual(formLayout(list, mode, 340).buds, []);
});

test('islands: every song placed once, no covers overlap, all inside the width', () => {
  const list = songs(80);
  for (const mode of ['genre', 'listeners', 'color', 'when'] as Mode[]) {
    const form = formLayout(list, mode, 343);
    assert.equal(new Set(form.cells.map((c) => c.id)).size, 80, mode);
    for (const c of form.cells)
      assert.ok(c.x - c.d / 2 >= 0 && c.x + c.d / 2 <= 343 && c.y + c.d / 2 <= form.height, `${mode} out of bounds`);
    for (let i = 0; i < form.cells.length; i++)
      for (let j = i + 1; j < form.cells.length; j++) {
        const [a, b] = [form.cells[i], form.cells[j]];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.d - 0.01, `${mode} covers overlap`);
      }
  }
});

test('islands: one labeled island per group, separate bodies', () => {
  const form = formLayout(songs(36), 'genre', 343);
  assert.equal(form.labels.length, GENRES.length);
  assert.ok(form.labels.every((l) => / · 6$/.test(l.text)));
  assert.equal(loops(bodyPath(form.cells, form.width, form.height)), GENRES.length);
});

test('islands: listeners go from everyone-knows to almost nobody', () => {
  const form = formLayout(songs(20), 'listeners', 343);
  assert.deepEqual(
    form.labels.map((l) => l.text.split(' · ')[0]),
    ['Everyone knows', 'Known, not famous', 'Under the radar', 'Almost nobody']
  );
});

test('genreFamily: odd iTunes genres fold into a few families', () => {
  assert.equal(genreFamily('Urbano latino'), 'Latin');
  assert.equal(genreFamily('Dance'), 'Electronic');
  assert.equal(genreFamily('Alternative Rap'), 'Hip-Hop');
  assert.equal(genreFamily('Indie Pop'), 'Alternative');
  assert.equal(genreFamily('Singer/Songwriter'), 'Country & Folk');
  assert.equal(genreFamily('Polka'), 'Polka');
  assert.equal(genreFamily('Anime'), 'Anime');
});

test('hexBlob: a big group narrows to fit the width', () => {
  const pts = hexBlob(120, 48, 300);
  const xs = pts.map((p) => p.x);
  assert.equal(pts.length, 120);
  assert.ok(Math.max(...xs) - Math.min(...xs) + 48 <= 300);
});

test('bodyPath: near cells melt into one body, far ones stay apart', () => {
  const cell = (x: number) => ({ id: x, x, y: 50, r: 10, d: 8 });
  assert.equal(loops(bodyPath([cell(40), cell(58)], 200, 100)), 1);
  assert.equal(loops(bodyPath([cell(40), cell(140)], 200, 100)), 2);
  assert.equal(bodyPath([], 200, 100), '');
});

// A 2x2 RGB PNG with a Sub-filtered row and an Up-filtered row.
function png2x2(): Uint8Array {
  const raw = new Uint8Array([1, 200, 10, 10, 20, 100, 30, 2, 0, 0, 100, 5, 5, 5]);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(
      [...type].map((c) => c.charCodeAt(0)),
      4
    );
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array([0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (all.set(p, at), at + p.length), 0);
  return all;
}

test('decodeTinyPng: undoes row filters', () => {
  assert.deepEqual(decodeTinyPng(png2x2(), unzlibSync), [
    [200, 10, 10],
    [220, 110, 40],
    [200, 10, 110],
    [225, 115, 45],
  ]);
  assert.equal(decodeTinyPng(new Uint8Array([1, 2, 3]), unzlibSync), null);
});

test('coverColor: picks the most colorful pixel and lifts it off navy', () => {
  const c = coverColor([
    [10, 10, 10],
    [20, 20, 20],
    [120, 10, 10],
  ])!;
  assert.equal(c.neutral, false);
  assert.ok(c.hue < 5 || c.hue > 355);
  assert.ok(c.main[0] > 150, 'lifted');
  assert.equal(coverColor([[240, 240, 240]])!.neutral, true);
  assert.equal(tinyArtworkUrl('https://x/a.png/100x100bb.jpg'), 'https://x/a.png/3x3bb.png');
});
