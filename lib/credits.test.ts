import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appleMusicUrl, CREDIT_LINE, lastfmArtistUrl } from './credits.ts';

test('appleMusicUrl prefers the store link iTunes gave us, else builds one from the track id', () => {
  assert.equal(appleMusicUrl(123, 'https://music.apple.com/us/album/x/1?i=123'), 'https://music.apple.com/us/album/x/1?i=123');
  assert.equal(appleMusicUrl(123), 'https://music.apple.com/us/song/123');
  assert.equal(appleMusicUrl(123, ''), 'https://music.apple.com/us/song/123');
});

test('lastfmArtistUrl points at the artist catalogue page', () => {
  assert.equal(lastfmArtistUrl('The xx'), 'https://www.last.fm/music/The+xx');
  assert.equal(lastfmArtistUrl('AC/DC'), 'https://www.last.fm/music/AC%2FDC');
});

test('the credit line names both sources as their terms ask', () => {
  assert.equal(CREDIT_LINE, 'Previews provided courtesy of iTunes · Listener data from Last.fm');
});
