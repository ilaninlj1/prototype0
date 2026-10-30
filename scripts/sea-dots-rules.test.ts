import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { decodeArc, fibonacciSphere, inPolygon, ringFromArcs } from './sea-dots-rules.ts';

test('quantized arcs decode back to degrees', () => {
  const t = { scale: [0.5, 0.25] as [number, number], translate: [-180, -90] as [number, number] };
  assert.deepEqual(decodeArc([[0, 0], [2, 4], [2, -4]], t), [[-180, -90], [-179, -89], [-178, -90]]);
});

test('a ring joins its arcs, reversing negative ones, without repeating the joints', () => {
  const arcs: [number, number][][] = [
    [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 1]],
  ];
  assert.deepEqual(ringFromArcs([0, ~1], arcs), [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
});

test('a point is inside the outer ring and outside its hole', () => {
  const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.equal(inPolygon([2, 2], [square, hole]), true);
  assert.equal(inPolygon([5, 5], [square, hole]), false);
  assert.equal(inPolygon([12, 5], [square, hole]), false);
});

test('the lattice covers the sphere evenly: as many dots north as south, none off the globe', () => {
  const dots = fibonacciSphere(2000);
  const north = dots.filter(([lat]) => lat > 0).length;
  assert.ok(Math.abs(north - 1000) <= 1);
  assert.ok(dots.every(([lat, lng]) => lat >= -90 && lat <= 90 && lng >= -180 && lng < 180));
});

test('the baked globe has land where land is and sea where sea is', () => {
  const file = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../assets/sea-dots.json'), 'utf8')) as { dots: number[] };
  const pairs: [number, number][] = [];
  for (let i = 0; i < file.dots.length; i += 2) pairs.push([file.dots[i], file.dots[i + 1]]);
  // A dot within 3° along the sphere (the lattice is about 2.3° apart).
  const rad = Math.PI / 180;
  const near = (lat: number, lng: number) =>
    pairs.some(([a, b]) => {
      const cos = Math.sin(a * rad) * Math.sin(lat * rad) + Math.cos(a * rad) * Math.cos(lat * rad) * Math.cos((b - lng) * rad);
      return Math.acos(Math.min(1, cos)) < 3 * rad;
    });
  for (const [name, lat, lng] of [['Paris', 48.9, 2.4], ['Dallas', 32.8, -96.8], ['Lagos', 6.5, 3.4], ['Sydney', -33.9, 151.2], ['the South Pole', -89, 0], ['Tokyo', 35.7, 139.7]] as const)
    assert.ok(near(lat, lng), `${name} is land`);
  for (const [name, lat, lng] of [['mid-Atlantic', 30, -40], ['mid-Pacific', 0, -150], ['Indian Ocean', -30, 80]] as const)
    assert.ok(!near(lat, lng), `${name} is sea`);
  assert.ok(pairs.length > 2000 && pairs.length < 2800);
});
