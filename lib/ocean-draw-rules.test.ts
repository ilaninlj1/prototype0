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

test('nothing loaded up front brings Skia with it: only type imports reach the canvas files', () => {
  // On the web Skia binds when its module is first evaluated, so one stray value import blanks the whole ocean.
  for (const file of ['components/ocean/ocean-overlay.tsx', 'components/ocean/ocean-chart.tsx', 'components/ocean/ocean-ui.tsx', 'components/ocean/hatchling.tsx', 'components/ocean/creature-sheet.tsx', 'hooks/use-ocean.ts', 'app/ocean-lab.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /@shopify\/react-native-skia/, `${file} imports Skia`);
    for (const line of source.split('\n')) {
      if (/^import (?!type ).*(ocean-canvas|ocean-chart-canvas|ocean-art|ocean-draw)'/.test(line)) assert.fail(`${file}: ${line}`);
    }
  }
});

test('the frame file only imports worklets from lib', () => {
  const source = readFileSync('components/ocean/ocean-draw.ts', 'utf8');
  assert.doesNotMatch(source, /from '@\/lib\/ocean-person'/);
  assert.doesNotMatch(source, /from '@\/lib\/ocean-cast'/);
});
