// Builds assets/sea-dots.json, the land of The Sea's globe: an even lattice of dots over the sphere, kept where
// Natural Earth's 1:110m land is (public domain; the world-atlas package's land-110m.json, ISC). Dev only.
//
//   curl -L -o /tmp/land-110m.json https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json
//   npm run build-sea-dots -- /tmp/land-110m.json

import fs from 'node:fs';
import path from 'node:path';

import { landDots, landPolygons } from './sea-dots-rules.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
/** About 2.3° between dots: dense enough to read coastlines on a phone-sized globe, about 2,400 land dots. */
const LATTICE = 8000;

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run build-sea-dots -- <land-110m.json>');
  process.exit(1);
}
const polygons = landPolygons(JSON.parse(fs.readFileSync(input, 'utf8')));
const dots = landDots(LATTICE, polygons);
const r1 = (v: number) => Math.round(v * 10) / 10;
const out = { v: 1, lattice: LATTICE, dots: dots.flatMap(([lat, lng]) => [r1(lat), r1(lng)]) };
fs.writeFileSync(path.join(ROOT, 'assets/sea-dots.json'), JSON.stringify(out));
console.log(`${polygons.length} land polygons → ${dots.length} of ${LATTICE} dots on land → assets/sea-dots.json`);
