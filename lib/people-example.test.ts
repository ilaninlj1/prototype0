import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXAMPLE_ID, examplePerson } from './people-example.ts';
import { matchScore, parsePeople } from './people.ts';

test('the example row survives parsePeople unchanged', () => {
  const { row } = examplePerson();
  assert.equal(row.person, EXAMPLE_ID);
  assert.deepEqual(parsePeople([row]), [row]);
});

test('the example scores five shared songs without listener data', () => {
  const { row, score } = examplePerson();
  const scored = matchScore(row, () => null);
  assert.equal(scored.shared, 5);
  assert.equal(scored.weighted, 5);
  assert.deepEqual(score, scored);
});
