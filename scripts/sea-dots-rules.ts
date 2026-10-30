// The pure parts of baking The Sea's globe (scripts/build-sea-dots.ts): decoding Natural Earth's land outline from
// TopoJSON, testing a point against it, and spreading dots evenly over the sphere.

type Pt = [number, number];
type Topology = {
  transform?: { scale: Pt; translate: Pt };
  arcs: Pt[][];
  objects: Record<string, { type: string; geometries?: { type: string; arcs: number[][][] | number[][][][] }[] }>;
};

/** An arc's points as [lng, lat], undoing TopoJSON's quantized deltas. */
export function decodeArc(arc: Pt[], transform?: { scale: Pt; translate: Pt }): Pt[] {
  if (!transform) return arc.map(([x, y]) => [x, y]);
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]];
  });
}

/** One ring from arc indexes (a negative index ~i is arc i reversed), without the joints' repeated points. */
export function ringFromArcs(indexes: number[], arcs: Pt[][]): Pt[] {
  const ring: Pt[] = [];
  indexes.forEach((i, k) => {
    const arc = i >= 0 ? arcs[i] : [...arcs[~i]].reverse();
    ring.push(...(k === 0 ? arc : arc.slice(1)));
  });
  return ring;
}

/** Every land polygon as rings ([outer, ...holes]) in [lng, lat]. */
export function landPolygons(topo: Topology, object = 'land'): Pt[][][] {
  const arcs = topo.arcs.map((a) => decodeArc(a, topo.transform));
  const polygons: Pt[][][] = [];
  for (const g of topo.objects[object]?.geometries ?? []) {
    const list = (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []) as number[][][];
    for (const polygon of list as unknown as number[][][]) polygons.push(polygon.map((ring) => ringFromArcs(ring, arcs)));
  }
  return polygons;
}

/** Even-odd ray test in [lng, lat]: inside the outer ring and outside its holes. */
export function inPolygon(p: Pt, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** n points spread evenly over the sphere (a Fibonacci lattice), as [lat, lng] in degrees. */
export function fibonacciSphere(n: number): Pt[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const theta = golden * i;
    const lng = ((((theta * 180) / Math.PI + 180) % 360) + 360) % 360 - 180;
    return [(Math.asin(y) * 180) / Math.PI, lng];
  });
}

/** The lattice points that fall on land. Natural Earth stops at 85.6°S, so everything south of it is Antarctica. */
export function landDots(n: number, polygons: Pt[][][]): Pt[] {
  return fibonacciSphere(n).filter(([lat, lng]) => lat < -85 || polygons.some((rings) => inPolygon([lng, lat], rings)));
}
