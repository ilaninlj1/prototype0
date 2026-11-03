import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hitMember } from './ocean-hit.ts';

const fish = (scale: number) => ({ scale, look: 'clown' });

test('a tap on a creature finds it, and open water finds nothing', () => {
  const members = [fish(1), fish(1)];
  const poses = [{ x: 100, y: 100 }, { x: 300, y: 300 }];
  assert.equal(hitMember(102, 98, members, poses), 0);
  assert.equal(hitMember(298, 305, members, poses), 1);
  assert.equal(hitMember(200, 200, members, poses), null);
});

test('overlapping creatures: the nearest one wins, and the drawn-last one wins a tie', () => {
  const members = [fish(1), fish(1)];
  assert.equal(hitMember(105, 100, members, [{ x: 100, y: 100 }, { x: 112, y: 100 }]), 0);
  assert.equal(hitMember(100, 100, members, [{ x: 100, y: 100 }, { x: 100, y: 100 }]), 1);
});

test('small fish still have a finger-sized target, and big ones a bigger one', () => {
  assert.equal(hitMember(120, 100, [fish(0.6)], [{ x: 100, y: 100 }]), 0);
  assert.equal(hitMember(145, 100, [fish(0.6)], [{ x: 100, y: 100 }]), null);
  assert.equal(hitMember(145, 100, [fish(1.9)], [{ x: 100, y: 100 }]), 0);
});

test('a whale is a big target', () => {
  assert.equal(hitMember(170, 100, [{ scale: 1, look: 'whale' }], [{ x: 100, y: 100 }]), 0);
});

test('an empty cast taps nothing', () => {
  assert.equal(hitMember(0, 0, [], []), null);
});
