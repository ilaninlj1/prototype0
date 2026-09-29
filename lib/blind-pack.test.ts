import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchLine, orderByIds, packable, packUrl, parsePack, shareBackText } from './blind-pack.ts';
import type { DiscoveryTrack } from './discovery.ts';

const t = (id: number, artistId = 7) => ({ id, artistId }) as DiscoveryTrack;

test('packUrl encodes ids and the sender name', () => {
  assert.equal(packUrl('https://x.expo.app', [1, 2, 3], 'Ilan R'), 'https://x.expo.app/pack?ids=1,2,3&from=Ilan%20R');
});

test('parsePack keeps up to 5 distinct valid ids and a tidy name', () => {
  assert.deepEqual(parsePack('5,x,5,-2,6,7,8,9,10', '  Sam  '), { ids: [5, 6, 7, 8, 9], from: 'Sam' });
  assert.deepEqual(parsePack(undefined, undefined), { ids: [], from: 'A friend' });
  assert.equal(parsePack('1', 'x'.repeat(50)).from.length, 30);
});

test('orderByIds restores the sender order and drops missing tracks', () => {
  assert.deepEqual(orderByIds([t(3), t(1)], [1, 2, 3]).map((x) => x.id), [1, 3]);
});

test('packable needs a real iTunes track: an artist id or an Apple Music link', () => {
  assert.equal(packable(t(12, 34)), true);
  assert.equal(packable({ ...t(12, 0), trackViewUrl: 'https://music.apple.com/us/song/12' }), true);
  assert.equal(packable({ ...t(12, 0), trackViewUrl: '' }), false); // old Blind Spot Test likes used a hash id
});

test('match wording and share-back text', () => {
  assert.equal(matchLine('Ilan', 3, 5), 'You and Ilan agree on 3 of 5 — 60% taste match.');
  assert.equal(matchLine('Ilan', 0, 0), 'No songs to compare.');
  assert.equal(shareBackText('Ilan', 3, 5, 'https://x/pack?ids=1'), "I matched Ilan's Blindspot pack 3/5 🎯 https://x/pack?ids=1");
});
