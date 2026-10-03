import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorizeUrl,
  base64Url,
  callbackTarget,
  describeImport,
  packState,
  readQuery,
  safeReturnUrl,
  SPOTIFY_REDIRECT,
  toLike,
  unpackState,
  verifierFrom,
} from './spotify.ts';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const APP = 'exp://u.expo.dev/93a021d9-29e0-41bb-876f-2d5ffba00638/group/6fb9158f/--/spotify-auth';

test('verifierFrom makes a PKCE verifier of allowed characters only', () => {
  const v = verifierFrom(new Uint8Array(64).map((_, i) => i * 7));
  assert.equal(v.length, 64);
  assert.match(v, /^[A-Za-z0-9\-._~]+$/);
});

test('base64Url turns base64 into the URL-safe form PKCE needs', () => {
  assert.equal(base64Url('ab+c/d=='), 'ab-c_d');
});

test('state carries a nonce and the way back into the app', () => {
  const s = packState('n0nce', APP);
  assert.deepEqual(unpackState(s), { nonce: 'n0nce', returnUrl: APP });
  assert.equal(unpackState('no-separator'), null);
  assert.equal(unpackState(undefined), null);
});

test('authorizeUrl asks Spotify for liked songs only, with PKCE', () => {
  const url = authorizeUrl({ clientId: 'abc', challenge: 'xyz', state: packState('n', APP) });
  const q = readQuery(url.slice(url.indexOf('?')));
  assert.ok(url.startsWith('https://accounts.spotify.com/authorize?'));
  assert.equal(q.client_id, 'abc');
  assert.equal(q.response_type, 'code');
  assert.equal(q.redirect_uri, SPOTIFY_REDIRECT);
  assert.equal(q.code_challenge_method, 'S256');
  assert.equal(q.code_challenge, 'xyz');
  assert.equal(q.scope, 'user-library-read');
  assert.equal(unpackState(q.state)?.returnUrl, APP);
});

test('readQuery decodes a query string, plus signs included', () => {
  assert.deepEqual(readQuery('?code=a%2Fb&state=x+y&empty='), { code: 'a/b', state: 'x y', empty: '' });
  assert.deepEqual(readQuery('prototype0://spotify-auth?code=1'), { code: '1' });
  assert.deepEqual(readQuery(''), {});
});

test('safeReturnUrl only lets the web page hand codes back to this app', () => {
  assert.equal(safeReturnUrl(APP), true);
  assert.equal(safeReturnUrl('prototype0://spotify-auth'), true);
  assert.equal(safeReturnUrl('exp://u.expo.dev/some-other-project/--/x'), false);
  assert.equal(safeReturnUrl('https://evil.example/steal'), false);
  assert.equal(safeReturnUrl('javascript:alert(1)'), false);
});

test('callbackTarget forwards the code to the app, or nothing when unsafe', () => {
  const state = packState('n', APP);
  const target = callbackTarget(`?code=C0DE&state=${encodeURIComponent(state)}`);
  assert.ok(target?.startsWith(`${APP}?`));
  assert.deepEqual(readQuery(target!.slice(target!.indexOf('?'))), { code: 'C0DE', state });
  const denied = callbackTarget(`?error=access_denied&state=${encodeURIComponent(state)}`);
  assert.equal(readQuery(denied!.slice(denied!.indexOf('?'))).error, 'access_denied');
  assert.equal(callbackTarget(`?code=C&state=${encodeURIComponent(packState('n', 'https://evil.example'))}`), null);
  assert.equal(callbackTarget('?code=C'), null, 'no state, no way back');
});

test('toLike keeps what Rewind shows, with the date you liked it', () => {
  const item = {
    added_at: '2019-04-02T21:15:00Z',
    track: {
      id: 'T1',
      name: 'Song',
      artists: [{ name: 'A' }, { name: 'B' }],
      album: {
        images: [
          { url: 'big', width: 640, height: 640 },
          { url: 'mid', width: 300, height: 300 },
          { url: 'small', width: 64, height: 64 },
        ],
      },
    },
  };
  assert.deepEqual(toLike(item), { id: 'T1', name: 'Song', artist: 'A, B', art: 'mid', addedAt: Date.UTC(2019, 3, 2, 21, 15) });
  assert.equal(toLike({ added_at: '2019-04-02T21:15:00Z', track: null }), null, 'removed songs come back as null');
  assert.equal(toLike({ added_at: 'garbage', track: item.track }), null);
  assert.equal(toLike({ added_at: '2019-04-02T21:15:00Z', track: { ...item.track, album: { images: [] } } })?.art, '');
});

test('describeImport sums up what came in', () => {
  const now = at(2026, 10, 3);
  const like = (addedAt: number) => ({ id: String(addedAt), name: '', artist: '', art: '', addedAt });
  assert.equal(
    describeImport([like(at(2019, 4, 2)), like(at(2026, 9, 1)), like(at(2021, 1, 1))], now),
    '3 liked songs, back to 2019.'
  );
  assert.equal(describeImport([like(at(2026, 9, 1))], now), '1 liked song, from this year.');
  assert.equal(describeImport([], now), 'No liked songs on that Spotify account yet.');
  assert.equal(
    describeImport(
      Array.from({ length: 1234 }, () => like(at(2026, 1, 1))),
      now
    ),
    '1,234 liked songs, from this year.'
  );
});
