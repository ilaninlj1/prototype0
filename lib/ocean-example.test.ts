import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exampleInput } from './ocean-example.ts';
import { buildOcean, EXAMPLE_NOTICE, portrait } from './ocean-person.ts';
import { isBannedHue } from './print-recipe.ts';

const NOW = new Date(2026, 10, 3, 12).getTime();
const DAY = 86_400_000;

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const h = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (h * 60 + 360) % 360;
}

test('the bundled example has about 40 fictional saves over nine months', () => {
  const source = exampleInput(NOW);
  assert.equal(source.now, NOW);
  assert.equal(source.liked.length, 40);
  assert.equal(new Set(source.liked.map((t) => t.id)).size, 40);
  const dates = source.liked.map((t) => t.likedAt!);
  assert.ok(Math.max(...dates) <= NOW);
  assert.ok((Math.max(...dates) - Math.min(...dates)) / DAY >= 250);
  assert.ok((NOW - Math.min(...dates)) / DAY <= 280);
  for (const t of source.liked) {
    assert.ok(t.trackName.length > 0 && t.artistName.length > 0);
    assert.equal(t.previewUrl, '');
    assert.equal(t.trackViewUrl, '');
    assert.equal(t.artworkUrl100, '');
  }
  assert.match(EXAMPLE_NOTICE, /example/i);
  assert.match(EXAMPLE_NOTICE, /made.up|fictional/i);
});

test('the example builds through the real ocean code across at least six places', () => {
  const life = buildOcean(exampleInput(NOW));
  assert.equal(life.total, 40);
  const occupied = Object.values(life.places).filter((p) => p.creatures.length > 0);
  assert.ok(occupied.length >= 6);
  assert.ok(Object.values(life.places).some((p) => p.coral.length > 0));
  assert.ok(Object.values(life.places).some((p) => p.sand.specks.length > 0));
  const creatures = occupied.flatMap((p) => p.creatures);
  assert.ok(creatures.filter((c) => c.foundHour !== null && (c.foundHour >= 20 || c.foundHour < 6)).length > 30);
  assert.ok(portrait(life, NOW).some((line) => /night/i.test(line)));
  assert.ok(life.oldest?.first);
});

test('the example is deterministic and each call owns its data', () => {
  const a = exampleInput(NOW), b = exampleInput(NOW);
  assert.deepEqual(a.liked, b.liked);
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(buildOcean(a), buildOcean(b));
  a.liked[0].trackName = 'Changed only here';
  a.history[0].listenMs = 0;
  assert.notEqual(a.liked[0].trackName, b.liked[0].trackName);
  assert.notEqual(a.history[0].listenMs, b.history[0].listenMs);
  const sound = a.soundOf(b.liked[0].id)!;
  sound.energy = -1;
  assert.ok(b.soundOf(b.liked[0].id)!.energy >= 0);
});

test('example colors contain no violet and unknown ids have no made-up sound', () => {
  const source = exampleInput(NOW);
  const ids = new Set([...source.liked.map((t) => t.id), ...source.history.map((e) => e.trackId)]);
  for (const id of ids) {
    const color = source.colorOf(id);
    assert.match(color, /^#[0-9a-f]{6}$/i);
    assert.equal(isBannedHue(hue(color)), false);
  }
  assert.equal(source.soundOf(5), null);
});
