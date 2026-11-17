import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drawnScale, isBigText, scaled, TEXT_CAP, textScaleFromQuery } from './text-scale.ts';

test('text follows the phone setting until its cap', () => {
  assert.equal(drawnScale(1), 1);
  assert.equal(drawnScale(1.35), 1.35);
  assert.equal(drawnScale(3.1), TEXT_CAP.reading);
  assert.equal(drawnScale(3.1, TEXT_CAP.chrome), 1.25);
});

test('smaller than normal text is left alone, and a bad value means normal', () => {
  assert.equal(drawnScale(0.82), 0.82);
  assert.equal(drawnScale(0), 1);
  assert.equal(drawnScale(Number.NaN), 1);
});

test('a size beside text grows with it', () => {
  assert.equal(scaled(24, 1), 24);
  assert.equal(scaled(24, 3.1), 42);
  assert.equal(scaled(24, 3.1, TEXT_CAP.label), 31);
});

test('big text starts at one and a half times', () => {
  assert.equal(isBigText(1.35), false);
  assert.equal(isBigText(1.5), true);
  assert.equal(isBigText(3.1), true);
});

test('the web reads a text scale from the address', () => {
  assert.equal(textScaleFromQuery('?textScale=3.1'), 3.1);
  assert.equal(textScaleFromQuery('?note=1&textScale=2'), 2);
  assert.equal(textScaleFromQuery(''), 1);
  assert.equal(textScaleFromQuery(undefined), 1);
  assert.equal(textScaleFromQuery('?textScale=99'), 1);
});
