import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cluesLine } from './home-copy.ts';

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
