# Filter Out Generic Genre-Titled Tracks

**Bug:** `fetchTracksByGenre` searches iTunes with plain free-text (`search?term={genre}`) — a track literally titled after the genre ("Techno", "Amapiano") ranks highly for that term regardless of whether it's a real song. The existing `primaryGenreName` filter (`isGenreRelated`) catches a lot of unrelated junk, but not this specific pattern, since these tracks are often correctly (if vacuously) genre-tagged.

**Scope:** `lib/discovery.ts` (`isGenericGenreTitle`, wired into `parseGenreSearchResponse`), `lib/discovery.test.ts` (new coverage). No other file changes — this sits entirely in the existing parse/filter layer.

## Measurement: how bad it actually is

Live results, `limit=200`, US storefront, run through the app's real `isGenreRelated`/`parseGenreSearchResponse`:

| Genre | Raw results | Raw mismatch rate¹ | Kept today | Genre-titled junk among kept |
|---|---|---|---|---|
| Jazz | 200 | 82.5% | 35 | 0/35 |
| Techno | 200 | 23.5% | 153 | 5/153 |
| Pop | 198 | 47.5% | 103 | 2/103 |
| Amapiano | 199 | 70.4% | 59 | **9/59 (15%)** |
| Classical | 194 | 68.0% | 58 | 0/58 |

¹ fraction of raw results whose `primaryGenreName` fails today's `isGenreRelated` check.

Two separate things are true at once: the existing filter is already precise for some genres (Jazz, Classical — a raw pool that's 70-80% junk still comes out clean), and weak for others (Amapiano's kept set is still 15% generic one-off tracks by unfamiliar producer names — DJ Madder, Emocian'Beat, Dj Raay — literally titled "amapiano"). The reported bug is real but genre-dependent, not universal — this sample found zero genre-titled survivors for Jazz/Classical.

**One honest caveat:** one of Pop's two "titled just the genre" hits is Harry Styles' actual song "Pop" — a real, well-known track that happens to share its title with the genre. Any title-based filter accepts this as a rare, known false-positive cost.

## Verification: `genreId` is dead — same failure mode as `offset`

- `term=Pop&genreId=11` (11 = Jazz) vs. `term=Pop` alone: byte-identical results.
- `genreId=11` with no `term`: `resultCount: 0` — not usable as a standalone query either.
- `genreId=99999999` (not a real genre) alongside a term: no error, same count as a valid ID — silently accepted and discarded.
- The documented `attribute=genreIndex` (meant to restrict matching to the genre field specifically) was also checked and is equally dead: identical track-ID list, same order, as unrestricted search.

**There is no server-side genre constraint on this endpoint at all.** The bug's framing — `genreId` vs. `primaryGenreName` filtering — resolves to one real option: `primaryGenreName` post-filtering (already in place) is the entire mechanism available. The only lever is improving that filter, not adding a second one alongside it.

## The fix: drop tracks whose title is just the genre name

```ts
/**
 * True when a track's title, once normalized, is just the search term
 * itself — the "song literally titled 'Techno'/'Amapiano'" pattern that live
 * verification found makes up a real share of what the existing
 * primaryGenreName filter otherwise lets through (9/59 kept results for
 * "Amapiano", 5/153 for "Techno" in the sample above). These are
 * overwhelmingly generic/stock tracks by unfamiliar one-off producer names,
 * not real songs. Known false-positive cost: a genuinely famous song that
 * happens to share the genre's exact name (e.g. Harry Styles' "Pop") gets
 * dropped too — accepted rather than engineered around, since it's rare and
 * the alternative (some more elaborate carve-out) isn't evidenced by
 * anything measured here.
 */
export function isGenericGenreTitle(trackName: string, searchedGenre: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalize(trackName) === normalize(searchedGenre);
}
```

Wired into the existing filter chain in `parseGenreSearchResponse`, right after the existing genre-relatedness check:

```ts
export function parseGenreSearchResponse(json: unknown, searchedGenre: string): DiscoveryTrack[] {
  const results: any[] = Array.isArray((json as any)?.results) ? (json as any).results : [];
  return results
    .filter(hasPreview)
    .map(toDiscoveryTrack)
    .filter((t) => isGenreRelated(searchedGenre, t.primaryGenreName))
    .filter((t) => !isGenericGenreTitle(t.trackName, searchedGenre));
}
```

Deliberately narrow: exact match only (after stripping case/whitespace/punctuation), not "starts with," "contains," or a broader fuzzy pattern (e.g. "Techno Vol. 1", "Amapiano Mix"). The measurement only evidenced the exact-title case; broadening the match is a follow-up if the narrow version turns out insufficient in practice, not something to build ahead of evidence.

`fetchTracksByArtist`/`parseArtistLookupResponse` are untouched — an artist lookup isn't a genre text search, so this specific failure mode (a term-matching text search surfacing junk) doesn't apply there.

## Result pool size vs. the album-spread cap

No interaction needed. This filter runs inside `parseGenreSearchResponse`, entirely upstream of `refillQueue`/`spreadByAlbum` — by the time `spreadByAlbum` ever sees a candidate pool, the generic tracks are already gone, same as anything `isGenreRelated` already removes today. The size reduction is modest in most of the sample (Techno: 153→148, a ~3% cut) and only meaningful for the worst case observed (Amapiano: 59→50, a 15% cut). `refillQueue`'s existing multi-attempt loop and `refillQueueWithFallback`'s genre-fallback are already the mechanism that absorbs a thinner pool — nothing new is needed for that, the same way region-switching and album-spread's own cap already lean on that same safety net without requiring bespoke handling.

## Interaction with the region toggle

None needed, and not because it's unverified — because this filter is storefront-agnostic by construction. `region` only changes the fetch URL (`&country=...`); `parseGenreSearchResponse` runs identically on whatever JSON comes back, regardless of which storefront produced it. Worth noting the reverse relationship, though: the region toggle already *mitigates* this exact bug for genres where a region has a deeper, better-tagged catalog — amapiano's US search is mostly noise because the US catalog is thin for it, while ZA's amapiano search is clean throughout (`genre: Amapiano` end to end, per the region-toggle spec's verification) because the real catalog exists there. The title filter and the region toggle attack the same underlying problem — a thin/noisy catalog for a given genre — from two different angles, and neither depends on the other.

## Interaction with discovered-genres

Negligible. `discoveredGenres` is built by `extractGenres(fetched)`, where `fetched` is whatever `fetchForStrategy` already returned — i.e., tracks that already passed the *existing* `isGenreRelated` filter, each carrying a `primaryGenreName` that's already "related" to the searched genre. The generic tracks this fix drops don't carry some unique genre label found nowhere else in the batch (e.g., dropped "Techno"-titled tracks were tagged `Electronic`/`Dance` — labels plenty of other, legitimate tracks in the same batch also carry). Removing them shrinks `fetched` slightly; it doesn't remove any genre label from what gets discovered.

## Testing (`lib/discovery.test.ts`)

- `isGenericGenreTitle`: exact match after normalization (case, whitespace) is caught; punctuation/casing variants ("Techno!", "  techno  ") are caught; a title that merely *contains* the genre word but isn't just it ("Techno Nights") is not caught; a completely unrelated title is not caught; empty-string edge case.
- `parseGenreSearchResponse`: a result whose `primaryGenreName` matches but whose title is exactly the searched genre is dropped; a result whose title merely contains the genre word alongside other words is kept (assuming its genre tag matches); existing tests for this function (genre-unrelated filtering, missing-preview filtering) continue to pass unchanged, since this is an additional filter step, not a replacement of the existing one.

## Out of scope

- Broadening the title-match beyond exact normalized equality (e.g. "contains only genre word + filler like 'vol'/'mix'/numbers") — not evidenced by this measurement.
- Any change to `fetchTracksByArtist`/`parseArtistLookupResponse` — the failure mode doesn't apply there.
- Adding `GENRE_TERM_OVERRIDES` entries for genres that don't currently have one (Jazz, Pop, Classical, R&B, Rock, Hip-Hop, Country, Electronic, Reggae) — the measurement shows the *existing* substring-matching filter is already fairly precise for at least Jazz and Classical (high raw junk, clean kept set); Pop's broader substring matches (K-Pop, Vocal Pop, Dance Pop, Pop Latino) are arguably legitimate Pop-adjacent hits, not clearly wrong. No override is added without the kind of live evidence that justified the existing ones.
- Any retry/backfill mechanism to compensate for the reduced pool size — the existing fallback machinery already covers this.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | `isGenericGenreTitle`; `parseGenreSearchResponse` gains one more filter step |
| `lib/discovery.test.ts` | New test cases per above |
