import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mayUseCity, placeFromGeocode, placeFromTimeZone, roundCoord } from './bottle-place.ts';

test('rounds to the nearest 0.5°', () => {
  assert.equal(roundCoord(32.78), 33);
  assert.equal(roundCoord(-96.8), -97);
  assert.equal(roundCoord(32.7), 32.5);
  assert.equal(roundCoord(0.2), 0);
});

test('geocode uses the city, rounded, exact', () => {
  assert.deepEqual(placeFromGeocode({ city: 'Dallas', region: 'Texas', country: 'United States' }, 32.78, -96.8), {
    city: 'Dallas',
    country: 'United States',
    lat: 33,
    lng: -97,
    exact: true,
  });
});

test('geocode falls back to the subregion, then the region', () => {
  assert.equal(placeFromGeocode({ city: null, subregion: 'Dallas County', region: 'Texas', country: 'US' }, 1, 1)?.city, 'Dallas County');
  assert.equal(placeFromGeocode({ city: '', subregion: null, region: 'Texas', country: 'US' }, 1, 1)?.city, 'Texas');
});

test('geocode without a place name or a country is null', () => {
  assert.equal(placeFromGeocode({ city: 'Dallas', country: null }, 1, 1), null);
  assert.equal(placeFromGeocode({ country: 'US' }, 1, 1), null);
});

test('America/Chicago is Central US, never Chicago', () => {
  const p = placeFromTimeZone('America/Chicago');
  assert.equal(p.city, 'Somewhere in Central US');
  assert.equal(p.exact, false);
  assert.ok(!p.city.includes('Chicago'));
});

test('Europe/Lisbon falls back to Europe', () => {
  assert.equal(placeFromTimeZone('Europe/Lisbon').city, 'Somewhere in Europe');
});

test('South Africa and Mexico have their own regions', () => {
  assert.equal(placeFromTimeZone('Africa/Johannesburg').city, 'Somewhere in South Africa');
  assert.equal(placeFromTimeZone('America/Mexico_City').city, 'Somewhere in Mexico');
});

test('a garbage time zone is somewhere on Earth', () => {
  assert.equal(placeFromTimeZone('Nowhere/Atlantis').city, 'Somewhere on Earth');
  assert.equal(placeFromTimeZone('').city, 'Somewhere on Earth');
});

test('the city is used only when you said "Use my city", even if location is allowed for Run', () => {
  assert.equal(mayUseCity({ cityOk: false, asking: false }), false);
  assert.equal(mayUseCity({ cityOk: true, asking: false }), true);
  assert.equal(mayUseCity({ cityOk: false, asking: true }), true);
});
