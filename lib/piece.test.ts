import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMark, forkBranch, markSaved, migrateV2, newPiece, PIECE, piecePositions, removeLastMark, type PieceMark, type PieceState } from './piece.ts';
import { recipeFor } from './print-recipe.ts';

const fresh = (): PieceState => ({ piece: newPiece(1, 0), finished: [] });
const m = (trackId: number, kind: 'reveal' | 'skip' = 'reveal'): Omit<PieceMark, 'branch'> => ({
  trackId, kind, saved: false, recipe: recipeFor(trackId, null, null),
  song: kind === 'reveal' ? { title: `t${trackId}`, artist: `a${trackId}`, artwork: '' } : undefined,
});
const add = (s: PieceState, id: number, kind?: 'reveal' | 'skip') => addMark(s, m(id, kind), 1).state;

test('adds marks once per song', () => {
  let s = add(fresh(), 1);
  s = add(s, 1);
  assert.equal(s.piece.marks.length, 1);
});

test('the 50th mark finishes the piece and starts the next', () => {
  let s = fresh();
  for (let i = 1; i < PIECE.slots; i++) s = add(s, i);
  const out = addMark(s, m(50), 99);
  assert.equal(out.finished?.marks.length, 50);
  assert.equal(out.finished?.finishedAt, 99);
  assert.equal(out.state.piece.number, 2);
  assert.equal(out.state.piece.marks.length, 0);
  assert.equal(out.state.finished.length, 1);
});

test('undo across the rollover reopens the finished piece', () => {
  let s = fresh();
  for (let i = 1; i <= PIECE.slots; i++) s = add(s, i);
  s = removeLastMark(s, 50);
  assert.equal(s.piece.number, 1);
  assert.equal(s.piece.marks.length, 49);
  assert.equal(s.piece.finishedAt, undefined);
  assert.equal(s.finished.length, 0);
});

test('undo only removes the newest mark when it is that song', () => {
  let s = add(add(fresh(), 1), 2);
  assert.equal(removeLastMark(s, 1).piece.marks.length, 2);
  s = removeLastMark(s, 2);
  assert.deepEqual(s.piece.marks.map((x) => x.trackId), [1]);
});

test('saving marks the song', () => {
  const s = markSaved(add(fresh(), 1), 1);
  assert.equal(s.piece.marks[0].saved, true);
  assert.equal(markSaved(s, 999), s);
});

test('a genre jump forks the next mark onto a new branch', () => {
  let s = add(fresh(), 1);
  s = add(s, 2, 'skip'); // the jumped-from song
  s = forkBranch(s);
  s = add(s, 3);
  assert.deepEqual(s.piece.marks.map((x) => x.branch), [0, 0, 1]);
  assert.equal(s.piece.pendingFork, false);
});

test('undoing a genre jump cancels its fork; undoing the next jump restores the earlier one', () => {
  let s = add(fresh(), 1);
  s = forkBranch(add(s, 2, 'skip')); // jump A
  s = removeLastMark(s, 2); // undo A
  assert.equal(s.piece.pendingFork, false);
  s = forkBranch(add(s, 2, 'skip')); // jump A again
  s = forkBranch(add(s, 3, 'skip')); // jump B consumes A's fork
  s = removeLastMark(s, 3); // undo B
  assert.equal(s.piece.pendingFork, true);
  assert.equal(add(s, 4).piece.marks.at(-1)!.branch, 1);
});

test('v2 migration keeps every mark, songs only for reveals', () => {
  const v2 = { number: 3, startedAt: 5, marks: [
    { trackId: 1, kind: 'bold' as const, saved: true, artwork: 'a1' },
    { trackId: 2, kind: 'ghost' as const, saved: false, artwork: 'a2' },
  ] };
  const done = { number: 2, startedAt: 1, finishedAt: 4, marks: [{ trackId: 9, kind: 'bold' as const, saved: false, artwork: 'a9' }] };
  const s = migrateV2(v2, [done], (x) => recipeFor(x.trackId, null, null), (id) => (id === 1 ? { title: 'One', artist: 'A', artwork: 'a1' } : undefined));
  assert.equal(s.piece.number, 3);
  assert.deepEqual(s.piece.marks.map((x) => [x.kind, x.saved, x.branch]), [['reveal', true, 0], ['skip', false, 0]]);
  assert.equal(s.piece.marks[0].song?.title, 'One');
  assert.equal(s.piece.marks[1].song, undefined);
  assert.equal(s.finished[0].marks[0].song, undefined); // no details kept: the art screen says so
  assert.equal(s.piece.pendingFork, false);
});

test('positions stay inside the strip, are stable, and shrink as it fills', () => {
  let s = fresh();
  for (let i = 1; i <= 3; i++) s = add(s, i);
  const few = piecePositions(s.piece.marks);
  assert.deepEqual(few, piecePositions(s.piece.marks));
  for (let i = 4; i < PIECE.slots; i++) s = i % 9 === 0 ? forkBranch(add(s, i, 'skip')) : add(s, i);
  const many = piecePositions(s.piece.marks);
  assert.ok(many[0].size < few[0].size);
  for (const p of many) {
    assert.ok(p.x - p.size / 2 >= 0 && p.x + p.size / 2 <= PIECE.width, `x ${p.x}`);
    assert.ok(p.y - p.size / 2 >= 0 && p.y + p.size / 2 <= PIECE.height, `y ${p.y}`);
  }
  for (let i = 1; i < many.length; i++) assert.ok(many[i].x > many[i - 1].x);
});
