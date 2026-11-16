import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardActions, cardLabel, spokenClues, spokenNewSong, spokenReveal } from './spoken.ts';

test('clues are read as words, not symbols', () => {
  assert.equal(spokenClues('104 BPM · C# minor · Close to home'), '104 beats per minute, C sharp minor, Close to home');
  assert.equal(spokenClues('98 BPM · Eb major'), '98 beats per minute, E flat major');
  assert.equal(spokenClues(null), '');
});

test('a new song says where it is from and how it sounds, never who it is', () => {
  assert.equal(spokenNewSong('Jazz', '59 BPM · C# minor'), 'New song, playing blind. Jazz. 59 beats per minute, C sharp minor.');
  assert.equal(spokenNewSong('Jazz', null), 'New song, playing blind. Jazz.');
});

test('the reveal says the song, the artist and the listeners when known', () => {
  assert.equal(spokenReveal('Kaya', 'Bob Marley', '4.8K'), 'Revealed: Kaya by Bob Marley. 4.8K listeners.');
  assert.equal(spokenReveal('Kaya', 'Bob Marley', null), 'Revealed: Kaya by Bob Marley.');
});

test('a blind card never gives the name away', () => {
  assert.equal(cardLabel(false, 'Kaya', 'Bob Marley'), 'A song, playing blind');
  assert.equal(cardLabel(true, 'Kaya', 'Bob Marley'), 'Kaya by Bob Marley');
});

test('the card offers the same actions as its swipes', () => {
  assert.deepEqual(cardActions(false, false).map((a) => a.name), ['more', 'skip', 'jump']);
  assert.deepEqual(cardActions(true, false).map((a) => a.name), ['next', 'save', 'details', 'jump']);
  assert.equal(cardActions(true, true)[1].label, 'Remove from saved');
});
