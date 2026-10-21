import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Colors, contrastRatio, DarkColors, toDark } from './theme.ts';

test('contrast ratio is the WCAG one: white on black is 21', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21);
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('the light room: text, secondary text and button labels pass 4.5:1', () => {
  assert.ok(contrastRatio(Colors.text, Colors.background) >= 4.5);
  assert.ok(contrastRatio(Colors.textSecondary, Colors.background) >= 4.5);
  assert.ok(contrastRatio(Colors.textSecondary, Colors.surface) >= 4.5);
  assert.ok(contrastRatio(Colors.accentText, Colors.accent) >= 4.5);
});

test('the dark set keeps the navy room for the card and the dark experiences', () => {
  assert.equal(Colors.background, '#FFFFFF');
  assert.equal(DarkColors.background, '#13213f');
  assert.equal(DarkColors.text, '#f3ead8');
  assert.ok(contrastRatio(DarkColors.text, DarkColors.background) >= 4.5);
});

test('toDark turns a light token into its navy twin and leaves other colors alone', () => {
  assert.equal(toDark(Colors.text), DarkColors.text);
  assert.equal(toDark(Colors.textSecondary), DarkColors.textSecondary);
  assert.equal(toDark(Colors.surface), DarkColors.surface);
  assert.equal(toDark('#123456'), '#123456');
  assert.equal(toDark(undefined), undefined);
});
