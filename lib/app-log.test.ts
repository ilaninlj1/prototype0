import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addEntry, describeError, formatLog, log, setLogSink, timed, type LogEntry } from './app-log.ts';

const at = (h: number, m: number, s: number, ms = 0) => new Date(2026, 10, 10, h, m, s, ms).getTime();

test('the log keeps only the newest entries, oldest dropped first', () => {
  let list: LogEntry[] = [];
  for (let i = 1; i <= 5; i++) list = addEntry(list, { t: i, kind: 'info', area: 'app', msg: `entry ${i}` }, 3);
  assert.deepEqual(list.map((e) => e.msg), ['entry 3', 'entry 4', 'entry 5']);
});

test('a long message is cut so one runaway error cannot fill the log', () => {
  const list = addEntry([], { t: 1, kind: 'error', area: 'app', msg: 'x'.repeat(5000) });
  assert.ok(list[0].msg.length <= 1001);
  assert.ok(list[0].msg.endsWith('…'));
});

test('the shared text has the phone details first, then one line per entry with its time', () => {
  const text = formatLog(
    [
      { t: at(15, 2, 11, 234), kind: 'info', area: 'people', msg: 'status member in 840ms' },
      { t: at(15, 2, 40, 5), kind: 'error', area: 'people', msg: 'people_deck took longer than 15s' },
    ],
    ['Blindspot 1.0.5', 'iOS 26.1']
  );
  assert.equal(
    text,
    [
      'Blindspot 1.0.5',
      'iOS 26.1',
      '',
      '15:02:11.234 info  people  status member in 840ms',
      '15:02:40.005 ERROR people  people_deck took longer than 15s',
    ].join('\n')
  );
});

test('log sends entries to whatever is listening, and does nothing when nothing is', () => {
  const got: LogEntry[] = [];
  log('people', 'before anyone listens');
  setLogSink((e) => got.push(e));
  log('people', 'deck 12 songs', 'warn');
  setLogSink(null);
  log('people', 'after');
  assert.equal(got.length, 1);
  assert.equal(got[0].area, 'people');
  assert.equal(got[0].kind, 'warn');
  assert.equal(got[0].msg, 'deck 12 songs');
});

test('timed logs how long something took, and logs the error when it fails', async () => {
  const got: LogEntry[] = [];
  setLogSink((e) => got.push(e));
  assert.equal(await timed('people', 'status', async () => 'member', (v) => v), 'member');
  await assert.rejects(timed('people', 'deck', async () => { throw new Error('people_deck took longer than 15s'); }), /15s/);
  setLogSink(null);
  assert.match(got[0].msg, /^status member in \d+ms$/);
  assert.equal(got[1].kind, 'error');
  assert.match(got[1].msg, /^deck failed after \d+ms: people_deck took longer than 15s/);
});

test('describeError reads errors, strings and plain objects', () => {
  assert.equal(describeError('nope'), 'nope');
  assert.match(describeError(new Error('broke')), /^broke/);
  assert.equal(describeError({ code: 42 }), '{"code":42}');
});
