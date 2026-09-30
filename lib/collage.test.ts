import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ART, addMark, collageRects, markSaved, removeLastMark, type ArtCanvas, type Mark } from './collage.ts';

const area = (r: { w: number; h: number }) => r.w * r.h;

test('collageRects: one song fills the whole canvas', () => {
  assert.deepEqual(collageRects(1), [{ x: 0, y: 0, w: ART.width, h: ART.height }]);
});

test('collageRects: each new song splits the biggest tile, so early pieces stay big', () => {
  const two = collageRects(2);
  assert.equal(two.length, 2);
  const full = ART.width * ART.height;
  assert.ok(two.every((r) => area(r) > full * 0.35 && area(r) < full * 0.65));
  const three = collageRects(3);
  assert.ok(Math.max(...three.map(area)) > full * 0.35);
});

test('collageRects: tiles never overlap and always cover the canvas exactly', () => {
  for (const n of [3, 10, 50]) {
    const rects = collageRects(n);
    assert.equal(rects.length, n);
    const total = rects.reduce((s, r) => s + area(r), 0);
    assert.ok(Math.abs(total - ART.width * ART.height) < 1, `n=${n}`);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        assert.ok(overlap < 0.01, `n=${n}: ${i} and ${j} overlap`);
      }
  }
});

test('collageRects: 50 tiles are all still big enough to show a cover', () => {
  const rects = collageRects(50);
  assert.ok(rects.every((r) => Math.min(r.w, r.h) >= 30));
});

const mark = (trackId: number, kind: Mark['kind'] = 'bold'): Mark => ({ trackId, kind, saved: false, artwork: 'https://x/100x100bb.jpg' });

test('addMark: the 50th swipe finishes the piece and starts a clean canvas', () => {
  let canvas: ArtCanvas = { number: 1, startedAt: 0, marks: [] };
  let finished: ArtCanvas | undefined;
  for (let i = 0; i < ART.slots; i++) {
    const out = addMark(canvas, mark(i, i % 2 ? 'bold' : 'ghost'), 1000 + i);
    canvas = out.canvas;
    finished = out.finished ?? finished;
  }
  assert.equal(finished!.marks.length, 50);
  assert.equal(canvas.marks.length, 0);
  assert.equal(canvas.number, 2);
});

test('addMark / markSaved / removeLastMark: once per song, red dot later, undo only the newest', () => {
  const one = addMark({ number: 1, startedAt: 0, marks: [] }, mark(1), 0).canvas;
  assert.equal(addMark(one, mark(1, 'ghost'), 0).canvas.marks.length, 1);
  assert.equal(markSaved(one, 1).marks[0].saved, true);
  const two = addMark(one, mark(2), 0).canvas;
  assert.equal(removeLastMark(two, 1).marks.length, 2);
  assert.equal(removeLastMark(two, 2).marks.length, 1);
});
