import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGenreSections, type GenreTaxonomy } from './genre-taxonomy.ts';

const taxonomy: GenreTaxonomy = {
  Electronic: ['House', 'Techno'],
  Latin: ['Salsa', 'Cumbia'],
};

test('curated genres with an assigned parent are grouped, not left flat', () => {
  const sections = buildGenreSections(['Electronic', 'House', 'Techno', 'Country'], [], taxonomy);
  const group = sections.find((s) => s.type === 'group' && s.label === 'Electronic');
  assert.ok(group);
  assert.deepEqual((group as any).children, ['House', 'Techno']);
  // House/Techno themselves don't also appear as separate top-level leaves
  assert.equal(
    sections.some((s) => s.type === 'leaf' && (s.genre === 'House' || s.genre === 'Techno')),
    false
  );
});

test('curated genres with no assigned parent stay flat leaves', () => {
  const sections = buildGenreSections(['Electronic', 'House', 'Techno', 'Country'], [], taxonomy);
  assert.deepEqual(
    sections.filter((s) => s.type === 'leaf').map((s: any) => s.genre),
    ['Country']
  );
});

test('a group label that is itself a curated genre is selectable; one that is not, is not', () => {
  const sections = buildGenreSections(
    ['Electronic', 'House', 'Techno', 'Salsa', 'Cumbia'],
    [],
    taxonomy
  );
  const electronic = sections.find((s) => s.type === 'group' && s.label === 'Electronic') as any;
  const latin = sections.find((s) => s.type === 'group' && s.label === 'Latin') as any;
  assert.equal(electronic.genre, 'Electronic'); // "Electronic" is a curated genre itself
  assert.equal(latin.genre, null); // "Latin" was never a curated genre, only an organizing label
});

test('discovered genres the taxonomy does not cover land in a Discovered group at the end', () => {
  const sections = buildGenreSections(['Country'], ['Punjabi Pop', 'Urbano latino'], taxonomy);
  const last = sections[sections.length - 1] as any;
  assert.equal(last.label, 'Discovered');
  assert.equal(last.genre, null);
  assert.deepEqual(last.children, ['Punjabi Pop', 'Urbano latino']);
});

test('a discovered genre that coincidentally matches a curated one is not duplicated into Discovered', () => {
  const sections = buildGenreSections(['Electronic', 'House', 'Techno'], ['House'], taxonomy);
  assert.equal(
    sections.some((s) => s.type === 'group' && s.label === 'Discovered'),
    false
  );
});

test('an empty Discovered bucket is omitted entirely, not rendered as an empty group', () => {
  const sections = buildGenreSections(['Country'], [], taxonomy);
  assert.equal(
    sections.some((s) => s.type === 'group' && s.label === 'Discovered'),
    false
  );
});

test('sections are sorted alphabetically by label, Discovered always last', () => {
  const sections = buildGenreSections(
    ['Electronic', 'House', 'Techno', 'Country'],
    ['Punjabi Pop'],
    taxonomy
  );
  const labels = sections.map((s) => (s.type === 'leaf' ? s.genre : s.label));
  assert.deepEqual(labels, ['Country', 'Electronic', 'Discovered']);
});
