import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Colors, contrastRatio, DarkColors, DarkTypography, DarkUi, toDark, Typography, Ui } from './theme.ts';

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

test('every small-text color on light screens passes 4.5:1', () => {
  for (const c of [Colors.text, Colors.textSecondary, Colors.destructive, Colors.positive]) {
    assert.ok(contrastRatio(c, Colors.background) >= 4.5, `${c} on white`);
    assert.ok(contrastRatio(c, Colors.surface) >= 4.5, `${c} on the grey surface`);
  }
  // The quietest grey is for white backgrounds only.
  assert.ok(contrastRatio(Colors.textTertiary, Colors.background) >= 4.5);
  // Black text on the gold sticker.
  assert.ok(contrastRatio(Colors.text, Colors.highlight) >= 4.5);
  // Red stays for the heart, saves and big numbers: 3:1 is the large-text bar.
  assert.ok(contrastRatio(Colors.signal, Colors.background) >= 3);
});

test('labels are sentence case on light screens and stay mono uppercase in the dark rooms', () => {
  assert.equal('textTransform' in Typography.eyebrow, false);
  assert.equal('textTransform' in Ui.label, false);
  assert.equal(Ui.label.fontFamily, 'Figtree_600SemiBold');
  assert.equal(DarkTypography.eyebrow.textTransform, 'uppercase');
  assert.equal(DarkUi.label.textTransform, 'uppercase');
  assert.equal(DarkUi.label.color, DarkColors.text);
  assert.equal(DarkUi.outlineButton.borderColor, DarkColors.hairline);
});
