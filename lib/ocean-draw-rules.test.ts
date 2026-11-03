import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// On a phone these run on the UI thread, where calling a function that isn't a worklet crashes the app. The web
// preview runs them on the JS thread, so it can't catch this. Only this check can, before a phone build.
const FILES = ['components/ocean/ocean-draw.ts', 'lib/ocean-motion.ts'];

for (const file of FILES) {
  test(`every function in ${file} that a frame calls is marked as a worklet`, () => {
    const source = readFileSync(file, 'utf8');
    const named = [...source.matchAll(/^(export )?function (\w+)\([^]*?\{\n(.*)$/gm)];
    assert.ok(named.length > 0);
    for (const match of named) assert.match(match[3], /^\s*'worklet';/, `${match[2]} is not a worklet`);
  });
}

test('the frame file only imports worklets from lib', () => {
  const source = readFileSync('components/ocean/ocean-draw.ts', 'utf8');
  assert.doesNotMatch(source, /from '@\/lib\/ocean-person'/);
  assert.doesNotMatch(source, /from '@\/lib\/ocean-cast'/);
});
