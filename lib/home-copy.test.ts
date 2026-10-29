import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cluesLine, listenerMeter, tuneSummary } from './home-copy.ts';

test('clues join the sound label and tier in sentence case', () => {
  assert.equal(cluesLine('104 BPM · E MINOR', 'Close to home'), '104 BPM · E minor · Close to home');
  assert.equal(cluesLine('148 BPM · C♯ MAJOR', null), '148 BPM · C♯ major');
});

test('clues can show just the tier or nothing', () => {
  assert.equal(cluesLine(null, 'New ground'), 'New ground');
  assert.equal(cluesLine(null, null), null);
});

test('only the words MAJOR and MINOR in the sound label change case', () => {
  assert.equal(cluesLine('BPM · MAJOR · MINOR · MAJORITY · MINORITY', 'New ground'),
    'BPM · major · minor · MAJORITY · MINORITY · New ground');
});

test('the listener meter runs from 1K (a hidden gem) to 10M (everyone), on a log scale', () => {
  assert.equal(listenerMeter(1_000), 0);
  assert.equal(listenerMeter(10_000_000), 1);
  assert.equal(listenerMeter(100_000), 0.5);
  assert.equal(listenerMeter(200), 0);
  assert.equal(listenerMeter(50_000_000), 1);
  assert.equal(listenerMeter(0), 0);
});

test('the Tune summary names the preset, then the sound when it is sorted', () => {
  assert.equal(tuneSummary('Hidden gems', null), 'Hidden gems');
  assert.equal(tuneSummary('Hidden gems', 'slow, calm'), 'Hidden gems · slow, calm');
});
