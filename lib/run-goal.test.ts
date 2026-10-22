import assert from 'node:assert/strict';
import { test } from 'node:test';

import { goalLine, goalPace, learnEasyPace, settledPace, steerFor, targetSpm } from './run-goal.ts';
import { EMPTY_PROFILE, type RunPoint } from './run-types.ts';

const withEasy = { ...EMPTY_PROFILE, easyPace: 400 };
const points = (fromS: number, toS: number, speed: number): RunPoint[] =>
  Array.from({ length: Math.floor((toS - fromS) / 5) + 1 }, (_, i) => ({ t: (fromS + i * 5) * 1000, lat: 0, lng: 0, speed, spm: 160 }));

test('typed pace wins', () => {
  assert.equal(goalPace(withEasy, 'push', 350), 350);
});

test('steady is 8 % faster than easy', () => {
  assert.equal(goalPace(withEasy, 'steady', null), 400 * 0.92);
  assert.equal(goalPace(withEasy, 'easy', null), 400);
});

test('no easy pace and no typed pace → null', () => {
  assert.equal(goalPace(EMPTY_PROFILE, 'easy', null), null);
});

test('too fast eases', () => {
  assert.equal(steerFor(370, 400, { firstRun: false }), 'ease');
  assert.equal(steerFor(385, 400, { firstRun: false }), 'hold');
});

test('too slow lifts', () => {
  assert.equal(steerFor(430, 400, { firstRun: false }), 'lift');
});

test('first run never lifts', () => {
  assert.equal(steerFor(500, 400, { firstRun: true }), 'hold');
  assert.equal(steerFor(370, 400, { firstRun: true }), 'ease');
});

test('null pace holds', () => {
  assert.equal(steerFor(null, 400, { firstRun: false }), 'hold');
  assert.equal(steerFor(380, null, { firstRun: false }), 'hold');
});

test('targetSpm clamps at natural ±6 %', () => {
  assert.equal(targetSpm(160, 160, 'hold'), 160);
  assert.equal(targetSpm(160, 160, 'ease'), 160 * 0.98);
  assert.equal(targetSpm(160, 168, 'lift'), 160 * 1.06);
  assert.equal(targetSpm(160, 150, 'ease'), 160 * 0.94);
});

test('talk yes builds 2 % faster', () => {
  assert.equal(learnEasyPace(withEasy, { avgPace: 420, goal: 'easy', talk: 'yes' }), 420 * 0.98);
  assert.equal(learnEasyPace(withEasy, { avgPace: 420, goal: 'easy', talk: 'mostly' }), 420);
});

test('talk no slows 4 %', () => {
  assert.equal(learnEasyPace(withEasy, { avgPace: 420, goal: 'easy', talk: 'no' }), 420 * 1.04);
});

test('a steady run teaches the easy pace it implies', () => {
  assert.equal(learnEasyPace(EMPTY_PROFILE, { avgPace: 368, goal: 'steady', talk: 'mostly' }), 368 / 0.92);
});

test('no answer keeps the old easy pace', () => {
  assert.equal(learnEasyPace(withEasy, { avgPace: 420, goal: 'easy', talk: null }), 400);
  assert.equal(learnEasyPace(withEasy, { avgPace: null, goal: 'easy', talk: 'yes' }), 400);
});

test('settledPace is null under 60 s of speeds', () => {
  assert.equal(settledPace(points(120, 170, 3)), null);
});

test('settledPace reads minutes 2 to 4', () => {
  const pts = [...points(0, 115, 4), ...points(120, 240, 2.5), ...points(245, 400, 4)];
  assert.equal(settledPace(pts), 400);
});

test('goal line copy', () => {
  assert.equal(goalLine(null, 'easy', true), 'Finding your stride');
  assert.equal(goalLine(null, 'easy', false), 'Finding your pace');
  assert.equal(goalLine('hold', 'steady', false), 'On pace · Steady');
  assert.equal(goalLine('ease', 'easy', false), 'A bit fast, easing off');
  assert.equal(goalLine('lift', 'push', false), 'Picking it up');
});
