import { matchScore, type Person, type PersonRow } from './people.ts';

export const EXAMPLE_ID = 'example';

export function examplePerson(): Person {
  const row: PersonRow = {
    person: EXAMPLE_ID,
    name: 'Maya',
    mode: 'either',
    // Bundled catalog tracks with preview URLs and sound-index entries.
    shared_tracks: [417357065, 1527508574, 1469239593, 1267405208, 1443793335],
    both_rated: 20,
    expected: 2,
    i_waved: false,
    they_waved: false,
    print: [
      { key: 0, mode: 1, energy: 0.25, tempo: 72 },
      { key: 7, mode: 0, energy: 0.68, tempo: 124 },
      { key: 2, mode: 1, energy: 0.92, tempo: 166 },
      { key: 9, mode: 0, energy: 0.42, tempo: 96 },
      { key: 4, mode: 1, energy: 0.56, tempo: 112 },
      { key: 11, mode: 0, energy: 0.18, tempo: 64 },
      { key: 5, mode: 1, energy: 0.77, tempo: 138 },
      { key: 1, mode: 0, energy: 0.34, tempo: 84 },
      { key: 8, mode: 1, energy: 0.85, tempo: 154 },
      { key: 3, mode: 0, energy: 0.49, tempo: 104 },
    ],
  };
  return { row, score: matchScore(row, () => null) };
}
