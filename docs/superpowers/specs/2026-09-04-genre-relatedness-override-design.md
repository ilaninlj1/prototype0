# Explicit Genre-Term Overrides

**Goal:** `isGenreRelated`'s substring check drops correct results whenever a search term shares no substring with the actual iTunes `primaryGenreName` it should match — confirmed against the live API: searching "reggaeton" returns 200 results, 148 of them `Urbano latino`, and every one is filtered out since neither string contains the other. Replace this for known terms with an explicit map of search term → acceptable `primaryGenreName` values, falling back to the current substring behavior for any term not in the map.

**Scope:** `lib/discovery.ts` and its tests only. No changes to `parseGenreSearchResponse`'s call site, `fetchTracksByGenre`, or anything upstream.

## Data

```ts
export type GenreTermOverrides = Record<string, string[]>;

// Keys and the strings in each value list are matched case-insensitively.
// Extend this as more search-term/primaryGenreName mismatches are found —
// it's plain data, no code changes needed to add an entry.
export const GENRE_TERM_OVERRIDES: GenreTermOverrides = {
  reggaeton: ['Urbano latino'],
};
```

Seeded with the one entry already verified against the live endpoint above. You'll supply the rest of the 16 broken terms found in your bulk test as additional entries in this object.

## `isGenreRelated`

```ts
export function isGenreRelated(
  searchTerm: string,
  trackGenre: string,
  overrides: GenreTermOverrides = GENRE_TERM_OVERRIDES
): boolean {
  const a = searchTerm.trim().toLowerCase();
  const b = trackGenre.trim().toLowerCase();
  if (!a || !b) return false;

  const acceptable = overrides[a];
  if (acceptable) {
    return acceptable.some((g) => g.trim().toLowerCase() === b);
  }

  return a.includes(b) || b.includes(a);
}
```

- A term present in `overrides` is matched by **exact** (case-insensitive) equality against its acceptable list only — substring logic is not consulted at all for that term, even if it would have happened to match. An override is a full replacement of the decision for that term, not an addition to it.
- A term absent from `overrides` behaves exactly as today (unchanged substring check) — this is the existing behavior for every term you didn't find broken.
- The `overrides` parameter defaults to the real `GENRE_TERM_OVERRIDES` constant, so `parseGenreSearchResponse`'s existing call (`isGenreRelated(searchedGenre, t.primaryGenreName)`) needs no change — the default takes over automatically. The parameter exists so tests can pass a small, self-contained map instead of depending on the exact (still-growing) contents of the real one.

## Tests (`lib/discovery.test.ts`)

- Override hit: a custom `{ reggaeton: ['Urbano Latino'] }` map matches `'Urbano Latino'` case-insensitively and rejects an unlisted genre for that same term, even one substring matching would have allowed.
- Fallback: a term absent from a custom map still uses substring behavior (reuses the existing `Hip-Hop`/`Hip-Hop/Rap` case).
- Real map: `isGenreRelated('reggaeton', 'Urbano latino')` (2-arg call, real default) returns `true` — proves the shipped seed entry works end-to-end, matching your reported case exactly.

## Out of scope

- Populating the rest of the map — you're supplying that data.
- Any change to how `discoveredGenres`/the genre picker/`pickJumpGenre` select search terms; this only changes whether a given (term, resulting genre) pair is accepted once iTunes has already responded.
