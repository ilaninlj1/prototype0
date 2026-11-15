import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addLink, BRANCH_POINTS, canLink, emptyCoral, gardenFloor, GARDEN_MARGIN,
  hitBranch, hitNode, layoutGarden, mixFor, parseCoral, removeLink,
  setLinkStart, setLinkType, touchPoint, traceStep,
} from './coral.ts';
import { MAX_LINKS, MAX_START, type CoralLink, type CoralSong, type GardenLayout } from './coral-types.ts';

const song = (trackId: number): CoralSong => ({
  trackId, trackName: `Song ${trackId}`, artistName: 'Artist', previewUrl: `clip:${trackId}`, color: '#40b8a0',
});
const link = (a: number, b: number, createdAt = a): CoralLink => ({
  id: `${a}-${b}`, a: song(a), b: song(b), type: 'fade', startA: 0, startB: 0, createdAt,
});
const saved = (links: unknown[]) => JSON.stringify({ version: 1, links });

test('parseCoral never throws on malformed storage', () => {
  for (const raw of [null, '', '{', 'null', 'false', '12', '[]', '{}', '{"version":2,"links":[]}', '{"version":1,"links":{}}']) {
    assert.deepEqual(parseCoral(raw), emptyCoral(), String(raw));
  }
  const valid = link(1, 2);
  const bad = [null, {}, [], { ...valid, a: null }, { ...valid, b: song(1) },
    { ...valid, id: '' }, { ...valid, type: 'other' }, { ...valid, createdAt: 'yesterday' },
    { ...valid, a: { ...song(1), trackId: '1' } }, { ...valid, a: { ...song(1), trackName: null } },
    { ...valid, b: { ...song(2), previewUrl: 3 } }];
  for (const value of bad) assert.deepEqual(parseCoral(saved([value])), emptyCoral());
  assert.deepEqual(parseCoral(saved([...bad, valid])).links, [valid]);
});

test('parseCoral keeps only model fields, unique pairs and unique ids', () => {
  const first = link(1, 2);
  const raw = saved([{ ...first, extra: true, a: { ...first.a, artwork: 'unused' } },
    { ...first, id: 'duplicate-pair' }, link(2, 1), { ...link(3, 4), id: first.id }, link(5, 6)]);
  assert.deepEqual(parseCoral(raw).links, [first, link(5, 6)]);
});

test('canLink gives every answer, and rejected additions preserve state', () => {
  const empty = emptyCoral();
  assert.equal(canLink(empty, song(1), song(2)), 'ok');
  assert.equal(canLink(empty, song(1), song(1)), 'same');
  assert.equal(addLink(empty, song(1), song(1), 'fade', 0), empty);
  const state = addLink(empty, song(1), song(2), 'cut', 100);
  assert.equal(state.links[0].type, 'cut');
  assert.equal(state.links[0].createdAt, 100);
  assert.deepEqual(empty.links, []);
  for (const [a, b] of [[1, 2], [2, 1]]) {
    assert.equal(canLink(state, song(a), song(b)), 'linked');
    assert.equal(addLink(state, song(a), song(b), 'fade', 200), state);
  }
  let full = emptyCoral();
  for (let i = 0; i < MAX_LINKS; i++) full = addLink(full, song(i * 2), song(i * 2 + 1), 'fade', i);
  assert.equal(full.links.length, MAX_LINKS);
  assert.equal(canLink(full, song(100), song(101)), 'full');
  assert.equal(addLink(full, song(100), song(101), 'fade', 200), full);
  assert.equal(canLink(full, song(0), song(0)), 'same');
  assert.equal(canLink(full, song(1), song(0)), 'linked');
  assert.equal(parseCoral(saved([...full.links, link(100, 101)])).links.length, MAX_LINKS);
});

test('start points clamp at both ends, including non-finite input', () => {
  const state = { version: 1 as const, links: [link(1, 2)] };
  for (const end of ['a', 'b'] as const) {
    for (const [seconds, want] of [[-8, 0], [0, 0], [7.5, 7.5], [24, MAX_START], [90, MAX_START], [NaN, 0], [Infinity, 0]]) {
      const next = setLinkStart(state, '1-2', end, seconds);
      assert.equal(next.links[0][end === 'a' ? 'startA' : 'startB'], want);
      assert.equal(next.links[0][end === 'a' ? 'startB' : 'startA'], 0);
    }
  }
  const parsed = parseCoral(saved([{ ...link(1, 2), startA: -3, startB: 100 }, { ...link(3, 4), startA: 'bad' }]));
  assert.equal(parsed.links[0].startA, 0);
  assert.equal(parsed.links[0].startB, MAX_START);
  assert.equal(parsed.links[1].startA, 0);
  assert.deepEqual(state.links, [link(1, 2)]);
});

test('editing and removing links preserve unrelated links and no-op state', () => {
  const state = { version: 1 as const, links: [link(1, 2), link(2, 3)] };
  assert.equal(setLinkType(state, 'missing', 'cut'), state);
  assert.equal(setLinkType(state, '1-2', 'fade'), state);
  assert.equal(setLinkStart(state, 'missing', 'a', 5), state);
  assert.equal(setLinkStart(state, '1-2', 'a', 0), state);
  assert.equal(removeLink(state, 'missing'), state);
  const next = setLinkType(state, '1-2', 'cut');
  assert.equal(next.links[0].type, 'cut');
  assert.equal(next.links[1], state.links[1]);
  assert.deepEqual(removeLink(next, '1-2').links, [state.links[1]]);
});

function gardenLinks(count: number, shape: 'chain' | 'star' | 'colonies') {
  return Array.from({ length: count }, (_, i) => shape === 'chain' ? link(i + 1, i + 2, i)
    : shape === 'star' ? link(1, i + 2, i) : link(2 * i + 1, 2 * i + 2, i));
}

function checkLayout(links: CoralLink[], width: number, height: number) {
  const before = structuredClone(links);
  const layout = layoutGarden(links, width, height);
  assert.deepEqual(links, before);
  assert.deepEqual(layout, layoutGarden(links, width, height));
  assert.deepEqual(layout, layoutGarden([...links].reverse(), width, height));
  assert.equal(layout.nodes.length, new Set(links.flatMap((l) => [l.a.trackId, l.b.trackId])).size);
  assert.equal(layout.branches.length, links.length);
  for (const [i, node] of layout.nodes.entries()) {
    assert.ok(node.r > 0);
    assert.ok(node.x - node.r >= GARDEN_MARGIN && node.x + node.r <= width - GARDEN_MARGIN);
    assert.ok(node.y - node.r >= GARDEN_MARGIN && node.y + node.r <= height - GARDEN_MARGIN);
    for (const other of layout.nodes.slice(i + 1)) {
      assert.ok(Math.hypot(node.x - other.x, node.y - other.y) >= node.r + other.r, `${node.trackId} overlaps ${other.trackId}`);
    }
  }
  for (const branch of layout.branches) {
    const a = layout.nodes.find((n) => n.trackId === branch.a)!;
    const b = layout.nodes.find((n) => n.trackId === branch.b)!;
    assert.equal(branch.points.length, BRANCH_POINTS);
    assert.equal(BRANCH_POINTS, 24);
    assert.deepEqual(branch.points[0], { x: a.x, y: a.y });
    assert.deepEqual(branch.points.at(-1), { x: b.x, y: b.y });
    const lengths = branch.points.slice(1).map((p, i) => Math.hypot(p.x - branch.points[i].x, p.y - branch.points[i].y));
    assert.ok(Math.max(...lengths) / Math.min(...lengths) < 1.05);
    assert.ok(branch.points.some((p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) > 0.1));
  }
  return layout;
}

for (const shape of ['chain', 'star', 'colonies'] as const) {
  for (const width of [320, 390, 1000]) {
    for (const count of [1, 4, 9, 16]) {
      test(`garden is deterministic, contained and spaced: ${shape}, ${count} links, width ${width}`, () => {
        checkLayout(gardenLinks(count, shape), width, 600);
      });
    }
  }
}

test('colonies and loops also fit a shallow box, with the oldest root on the floor', () => {
  for (const width of [320, 390, 1000]) {
    for (const shape of ['chain', 'star', 'colonies'] as const) checkLayout(gardenLinks(16, shape), width, 240);
  }
  const layout = checkLayout([link(3, 1, 2), link(2, 3, 1), link(1, 2, 0)], 390, 600);
  assert.equal(layout.nodes.find((n) => n.trackId === 1)!.y, gardenFloor(600));
});

test('an empty garden or a box without room has no geometry', () => {
  assert.deepEqual(layoutGarden([], 390, 600), { width: 390, height: 600, nodes: [], branches: [] });
  assert.equal(layoutGarden([link(1, 2)], 0, 600).nodes.length, 0);
  assert.equal(layoutGarden([link(1, 2)], 390, 0).nodes.length, 0);
});

const junction: GardenLayout = {
  width: 200, height: 200,
  nodes: [
    { trackId: 1, x: 0, y: 0, r: 8, color: '#fff', links: 2 },
    { trackId: 2, x: 100, y: 0, r: 8, color: '#fff', links: 2 },
  ],
  branches: [
    { linkId: 'ab', a: 1, b: 2, type: 'fade', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    { linkId: 'bc', a: 2, b: 3, type: 'cut', points: [{ x: 100, y: 0 }, { x: 100, y: 100 }] },
    { linkId: 'da', a: 4, b: 1, type: 'fade', points: [{ x: 0, y: 100 }, { x: 0, y: 0 }] },
    { linkId: 'ef', a: 5, b: 6, type: 'fade', points: [{ x: 50, y: -50 }, { x: 50, y: 50 }] },
  ],
};

test('hitBranch projects to the nearest branch within reach', () => {
  assert.deepEqual(hitBranch(junction, 24, 3, 5), { linkId: 'ab', t: 0.24 });
  assert.deepEqual(hitBranch(junction, 98, 30, 5), { linkId: 'bc', t: 0.3 });
  assert.deepEqual(hitBranch({ ...junction, branches: [junction.branches[0]] }, -5, 0, 5), { linkId: 'ab', t: 0 });
  assert.equal(hitBranch(junction, 150, 150, 5), null);
  assert.equal(hitBranch({ ...junction, branches: [] }, 0, 0, 5), null);
});

test('hitNode chooses the nearest center, including the polyp rim', () => {
  assert.equal(hitNode(junction, 7, 0, 2), 1);
  assert.equal(hitNode(junction, 89, 0, 12), 2);
  assert.equal(hitNode(junction, 60, 0, 70), 2);
  assert.equal(hitNode(junction, 50, 50, 5), null);
});

test('traceStep stays on its branch at a crossing and cannot jump to an unconnected branch', () => {
  assert.deepEqual(traceStep(junction, null, 24, 0, 6), { linkId: 'ab', t: 0.24 });
  assert.deepEqual(traceStep(junction, { linkId: 'ab', t: 0.4 }, 50, 3, 6), { linkId: 'ab', t: 0.5 });
  assert.equal(traceStep(junction, { linkId: 'ab', t: 0.5 }, 50, 30, 6), null);
  assert.equal(traceStep(junction, { linkId: 'ab', t: 0.5 }, 170, 170, 6), null);
  assert.equal(traceStep(junction, null, 170, 170, 6), null);
});

test('traceStep hands off at the shared song in both directions and both endpoint orientations', () => {
  assert.deepEqual(traceStep(junction, { linkId: 'ab', t: 0.98 }, 100, 10, 12), { linkId: 'bc', t: 0 });
  assert.deepEqual(traceStep(junction, { linkId: 'bc', t: 0.02 }, 90, 0, 12), { linkId: 'ab', t: 1 });
  assert.deepEqual(traceStep(junction, { linkId: 'ab', t: 0.02 }, 0, 10, 12), { linkId: 'da', t: 1 });
  assert.deepEqual(traceStep(junction, { linkId: 'da', t: 0.98 }, 10, 0, 12), { linkId: 'ab', t: 0 });
});

test('mixFor follows a fade and switches a cut exactly at the middle', () => {
  for (const t of [0, 0.2, 0.499, 0.5, 0.8, 1]) {
    assert.equal(mixFor('fade', t), t);
    assert.equal(mixFor('cut', t), t < 0.5 ? 0 : 1);
  }
  assert.equal(mixFor('fade', -1), 0);
  assert.equal(mixFor('fade', 2), 1);
  assert.equal(mixFor('fade', NaN), 0);
});

test('touchPoint interpolates samples, clamps to endpoints and handles missing branches', () => {
  for (const [t, x] of [[-1, 0], [0, 0], [0.25, 25], [1, 100], [2, 100], [NaN, 0]]) {
    assert.deepEqual(touchPoint(junction, { linkId: 'ab', t }), { x, y: 0 });
  }
  assert.deepEqual(touchPoint(junction, { linkId: 'missing', t: 0.5 }), { x: 0, y: 0 });
  const layout = layoutGarden([link(1, 2)], 390, 600);
  for (const t of [0, 0.19, 0.5, 0.81, 1]) {
    const point = touchPoint(layout, { linkId: '1-2', t });
    const hit = hitBranch(layout, point.x, point.y, 1e-8)!;
    assert.ok(Math.abs(hit.t - t) < 1e-10);
  }
});
