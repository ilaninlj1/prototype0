import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backOut, clamp01, expoIn, expoInOut, expoOut, lerp, prog, quintIn, quintInOut, quintOut } from './reel-ease.ts';

test('every curve runs from 0 to 1', () => {
  for (const f of [expoOut, expoIn, expoInOut, quintOut, quintIn, quintInOut, backOut]) {
    assert.ok(Math.abs(f(0)) < 1e-3, `${f.name}(0)`);
    assert.ok(Math.abs(f(1) - 1) < 1e-3, `${f.name}(1)`);
  }
});

test("backOut overshoots, the reel's pop", () => {
  assert.ok(Math.max(...[0.6, 0.7, 0.8, 0.9].map(backOut)) > 1);
});

test('prog maps a window of time to 0–1 and clamps', () => {
  assert.equal(prog(1, 2, 4), 0);
  assert.equal(prog(3, 2, 4), 0.5);
  assert.equal(prog(9, 2, 4), 1);
  assert.equal(clamp01(-2), 0);
  assert.equal(lerp(10, 20, 0.25), 12.5);
});
