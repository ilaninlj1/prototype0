import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAiTagged, isBlocked, normalizeArtist, proofLine } from './human-check.ts';

test('isAiTagged: the tags listeners actually use for AI acts', () => {
  assert.equal(isAiTagged(['AI', 'blues rock', 'AI slop']), true);
  assert.equal(isAiTagged(['clanker', 'country']), true);
  assert.equal(isAiTagged(['soul', 'rnb', 'artificial intelligence']), true);
  assert.equal(isAiTagged(['ai-generated']), true);
  assert.equal(isAiTagged(['AI Generated Music']), true);
  assert.equal(isAiTagged(['suno']), true);
});

test('isAiTagged: ordinary tags, and words that merely contain "ai", are not AI', () => {
  assert.equal(isAiTagged(['indie rock', 'shoegaze', 'female vocalists']), false);
  assert.equal(isAiTagged(['rai', 'algerian', 'thai', 'hawaiian', 'aim']), false);
  assert.equal(isAiTagged([]), false);
});

test('isAiTagged: a singer literally named AI is not flagged by her own name as a tag', () => {
  assert.equal(isAiTagged(['AI', 'j-pop', 'japanese'], 'AI'), false);
  assert.equal(isAiTagged(['AI', 'ai slop'], 'AI'), true);
});

test('normalizeArtist / isBlocked: match regardless of case, spacing and a leading "The"', () => {
  assert.equal(normalizeArtist('  The Velvet Sundown '), 'velvet sundown');
  const blocked = new Set(['velvet sundown']);
  assert.equal(isBlocked('the velvet sundown', blocked), true);
  assert.equal(isBlocked('Velvet Underground', blocked), false);
  assert.equal(isBlocked('Breaking Rust', blocked, new Set(['breaking rust'])), true);
});

test('proofLine: says what was found, and nothing when nothing was', () => {
  assert.equal(proofLine({ shows: 12, physical: 7 }), 'Real person · 12 shows on record · on vinyl or CD');
  assert.equal(proofLine({ shows: 1, physical: 0 }), 'Real person · 1 show on record');
  assert.equal(proofLine({ shows: 0, physical: 3 }), 'Real person · on vinyl or CD');
  assert.equal(proofLine({ shows: 0, physical: 0 }), null);
  assert.equal(proofLine(null), null);
});
