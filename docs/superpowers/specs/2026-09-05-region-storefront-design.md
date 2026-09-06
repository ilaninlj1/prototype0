# Region Toggle: Pull the Feed from a Different Apple Storefront

**Goal:** the "sleeper" idea (bias the feed toward deeper cuts) doesn't work via `offset` — verified dead against the live API (see below). The `country` parameter on the same endpoint is real, documented, and does something: switching storefronts can surface a genuinely different set of artists for the same genre term. Ship it as a regional-listening feature in its own right — an artist big in one market and unknown in another is genuinely undiscovered to that listener, which is what "sleeper" was actually after.

**Scope:** `lib/discovery.ts` (`Region` type, `fetchTracksByGenre`/`fetchTracksByArtist`/`fetchForStrategy` gain a region param), `lib/discovery-storage.ts` (`loadRegion`/`saveRegion`), `components/discovery/region-toggle.tsx` (new), `app/(tabs)/index.tsx` (bootstrap, `runRefill`, toggle handler, render).

## Verification

### `offset`: dead (confirmed again, not just trusted from the existing comment)

`term=House&limit=25` and `term=Jazz&limit=200` (the app's actual configuration), each at `offset` 0/75/150/400: **byte-identical results at every offset**, both terms. `offset` isn't a documented parameter of this endpoint — it's silently accepted and discarded. No further exploration of it.

### `country`: real, but divergence is a property of the genre+storefront pairing, not of the country alone

`limit=50`, artist-set overlap vs. US, across five pairings and four genres:

| Pairing | Genre term | US distinct | Other distinct | Overlap | Verdict |
|---|---|---|---|---|---|
| US vs CO | reggaeton | 36 | 35 | 97.2% | near-identical |
| US vs MX | reggaeton | 36 | 39 | 56.2% | meaningful |
| US vs NG | afrobeats | 38 | 34 | 89.5% | near-identical |
| US vs ZA | amapiano | 49 | 45 | **9.3%** | huge |
| US vs KR | K-pop | 14 | 0 | not comparable | term returns zero in KR |
| — vs PR | reggaeton | — | — | — | invalid storefront |

- **CO and NG ≈ US** — CO's reggaeton list and NG's afrobeats list are both near-duplicates of the US list (NG's first 8 results are in the *same order* as US's). The genre's biggest stars are already global crossover artists in both cases. Not useful controls.
- **MX diverges meaningfully** for reggaeton (Cris MJ, Quevedo, Piso 21, Mora, and others absent from the US list).
- **ZA diverges enormously** for amapiano — and not just in artist names: the US results for "Amapiano" are mostly *mistagged* (genres like Afro-fusion, Worldwide, R&B/Soul — tracks loosely adjacent to the term, not the genre itself), while ZA's are cleanly tagged `genre: Amapiano` throughout and surface a deep, coherent scene (Kabza De Small, DJ Maphorisa, Kelvin Momo, Young Stunna, Mas Musiq, Sha Sha) essentially absent from the US catalog for this term — 41 of ZA's 45 artists never appear in the US list.
- **KR is a valid storefront but this pairing doesn't work at all** — `resultCount: 0`, not an HTTP error like PR. The literal term "K-pop" (what `GENRES` would actually send) matches nothing in Korea's catalog, presumably because it's an externally-facing English label rather than how the genre is indexed locally. This is a *different failure mode* than "near-identical" — a pairing can silently return nothing for reasons that have nothing to do with musical overlap.
- **PR is not a valid storefront at all** — `HTTP 400 {"errorMessage":"Invalid value(s) for key(s): [country]"}`. Puerto Rico has no separate Apple storefront; PR users are served by the US one. Never offerable as an option.

**The conclusion isn't "regional storefronts diverge" or "they don't" — it's genre-and-region-pair-dependent**, ranging from 9.3% to 97.2% overlap across five checks of the same general idea, plus one pairing that doesn't resolve at all. **Scope: ship the three pairings with verified real divergence — US (default), MX, and ZA.** NG is dropped (89.5% identical — a dead control, same as CO) and KR is dropped (the term returns nothing). **Every additional storefront needs this same live check before being added** — a new pairing can silently come back near-duplicate (CO, NG) or empty (KR); that's not predictable from the country code or genre name alone, only from actually querying it.

### Track/album IDs are global, not storefront-scoped

Cross-checked identical songs by (artist, title) across US/CO/MX: `trackId` and `collectionId` were identical in every case checked (e.g. Nicky Jam & Enrique Iglesias – "El Perdón", Wisin & Yandel – "Ahora Es", Shakira – "Chantaje", ...). This is what makes the rest of the design simple: `seenTrackIds` dedup and `spreadByAlbum`'s recent-albums window need zero region-awareness — a track judged under one storefront is still correctly recognized if it resurfaces under another.

## `Region` type and the fetch layer

```ts
export type Region = 'US' | 'MX' | 'ZA';
export const REGIONS: Region[] = ['US', 'MX', 'ZA'];
export const DEFAULT_REGION: Region = 'US';

export async function fetchTracksByGenre(genre: string, region: Region = DEFAULT_REGION): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genre)}&entity=song&limit=${ITUNES_MAX_LIMIT}&country=${region}`;
  // ...unchanged otherwise
}

export async function fetchTracksByArtist(artistId: number, region: Region = DEFAULT_REGION): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=${ITUNES_MAX_LIMIT}&country=${region}`;
  // ...unchanged otherwise
}

export async function fetchForStrategy(strategy: Strategy, region: Region = DEFAULT_REGION): Promise<DiscoveryTrack[]> {
  return strategy.type === 'genre'
    ? fetchTracksByGenre(strategy.genre, region)
    : fetchTracksByArtist(strategy.artistId, region);
}
```

Defaulted, not required, so nothing that calls these without a region breaks.

## No changes to the queue engine

`refillQueue`, `refillQueueWithFallback`, and `spreadByAlbum` are untouched. Region is entirely a fetch-layer concern: the caller (`index.tsx`) binds it into the `fetcher` closure it already builds before passing it down —

```ts
await refillQueueWithFallback(baseQueue, activeStrategy, history, knownGenres, GENRES, (strategy) =>
  fetchForStrategy(strategy, activeRegion)
);
```

— rather than threading a new parameter through the queue engine's own signatures. Genre fallback keeps working exactly as before: `pickJumpGenre` picks a different genre, and the same region-bound fetcher is reused for the fallback attempt, so the fallback genre is pulled from the same storefront the user selected. `GENRE_TERM_OVERRIDES`/`isGenreRelated` need no region-awareness either — confirmed above that `primaryGenreName` comes back as the same localized string regardless of storefront.

## Cross-region dedup: confirmed, no change needed

`deriveSeenTrackIds(history)` builds its set from `trackId`s in `swipeHistory` regardless of which region fetched them — and since IDs are global (verified above), a track judged under MX correctly stays excluded if it resurfaces under US. This doesn't thin out a newly-selected region's catalog: only the minority of tracks that are shared crossover hits between storefronts (56% for reggaeton MX/US; a mere 9.3% for amapiano ZA/US — even less overlap means even less to collide with) are even capable of colliding with prior history; region-unique tracks were never in that history to begin with. If a strategy genuinely couldn't produce enough fresh tracks after a switch, `refillQueueWithFallback`'s existing genre-fallback is already the safety net — nothing new needed for that case either.

## Persistence (`lib/discovery-storage.ts`)

Same pattern as `discoveredGenres` — best-effort, falls back to the default on any read failure or corrupt/unrecognized value:

```ts
const REGION_KEY = `${STORAGE_PREFIX}:region`;

export async function loadRegion(): Promise<Region> {
  try {
    const raw = await AsyncStorage.getItem(REGION_KEY);
    return raw === 'MX' || raw === 'ZA' ? raw : 'US';
  } catch {
    return 'US';
  }
}

export async function saveRegion(region: Region): Promise<void> {
  try {
    await AsyncStorage.setItem(REGION_KEY, region);
  } catch {
    // ignore
  }
}
```

## `app/(tabs)/index.tsx`: bootstrap, refill, and the toggle

- Bootstrap loads `region` via `loadRegion()` alongside `swipeHistory`/`discoveredGenres`, into a new `region` state (`useState<Region>('US')`, set after load).
- `runRefill` gains one more explicit parameter, `activeRegion: Region`, and builds its fetcher as `(strategy) => fetchForStrategy(strategy, activeRegion)`. Every existing call site passes one more argument — the current `region` state for handlers that aren't changing it (`handleSkip`, `handleLike`, `applySteeringStrategy`, `commitGenreJump`, bootstrap), and the freshly-computed next region for the toggle handler specifically:

```ts
async function handleToggleRegion() {
  const nextRegion = REGIONS[(REGIONS.indexOf(region) + 1) % REGIONS.length];
  setRegion(nextRegion);
  await saveRegion(nextRegion);
  // Same "keep the current card, drop the stale buffered tail, refill under
  // the new setting" shape as applySteeringStrategy.
  const preserved = queue.slice(0, 1);
  setQueue(preserved);
  await runRefill(preserved, strategy, swipeHistory, discoveredGenres, nextRegion);
}
```

Cycles US → MX → ZA → US rather than a binary flip, now that there are three verified options.

`nextRegion` (the local variable), not the `region` state variable, is what's passed to `runRefill` — `setRegion` doesn't take effect synchronously within this same function call, and reading `region` here would still see the old value. `applySteeringStrategy` already avoids the equivalent trap for `strategy` by passing `next` explicitly rather than reading the `strategy` state; this follows the same precedent.

- Not part of `UndoSnapshot`. Undo rolls back a swipe or a steering choice — a momentary content action. The region toggle is a standing preference, closer in kind to a settings switch; conflating it with undo would blur two different categories of "changed my mind." Mis-tapping it is corrected by tapping it again.

## `components/discovery/region-toggle.tsx` (new)

Same visual pattern as `UndoButton`/`LikedTracksButton` — a persistent pill, positioned in the one corner nothing currently occupies:

```tsx
type RegionToggleProps = {
  region: Region;
  onToggle: () => void;
};

/** Persistent bottom-left pill — the one corner Undo/GenrePicker/Liked don't already occupy. Shows the current storefront; tap cycles to the next one. */
export function RegionToggle({ region, onToggle }: RegionToggleProps) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.wrapper}>
      <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
        <ThemedText type="label" style={styles.text}>{region}</ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', bottom: Spacing.lg, left: Spacing.lg, zIndex: 1 },
  button: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill },
  text: { color: Colors.textSecondary },
});
```

## Testing

`fetchTracksByGenre`/`fetchTracksByArtist`/`fetchForStrategy` make real network calls and, consistent with the rest of this file, aren't unit-tested directly today (only their pure JSON-parsing counterparts — `parseGenreSearchResponse`/`parseArtistLookupResponse` — and `refillQueue`/`refillQueueWithFallback`, via injected fake fetchers, are). This change is a defaulted-parameter extension to those same untested functions, not new logic, so no new test file is warranted for them. `loadRegion`/`saveRegion` mirror `discoveredGenres`'s persistence functions, which also have no dedicated test file. Verified via typecheck + lint + manual check in a browser (`npm run web`): toggle cycles the pill's label through US/MX/ZA, persists across a reload, and the fetched genre's results visibly change per region (e.g. "reggaeton" between US and MX, "amapiano" between US and ZA).

## Out of scope

- **Any additional storefront requires the same live verification pass first — this is the central lesson of this spec, not a formality.** Divergence is a property of the specific genre+storefront pairing, not of the country code or genre name in isolation: CO and NG each looked promising on paper and turned out ~90-97% identical to US; KR returned zero results for the exact term `GENRES` would send. None of that was predictable without querying it. Don't add a region — or assume an existing region behaves the same for a genre it hasn't been checked against — without repeating this check.
- A picker UI for more than three options — the cycling toggle is honest to what's actually been verified; revisit the UI shape if a fourth region clears the same bar.
- Any change to `spreadByAlbum`, `refillQueue`, `refillQueueWithFallback`, or `GENRE_TERM_OVERRIDES` — confirmed above that none is needed.
- Undo integration for the region toggle.
- Detecting or handling a genre+region pairing that returns zero results (the K-pop/KR case) — out of scope because it's not offered as an option; would need addressing if a future region turns out to work for most genres but fail for a specific one.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | `Region`, `REGIONS`, `DEFAULT_REGION`; `fetchTracksByGenre`/`fetchTracksByArtist`/`fetchForStrategy` gain a defaulted `region` param |
| `lib/discovery-storage.ts` | `loadRegion`, `saveRegion` |
| `components/discovery/region-toggle.tsx` | New |
| `app/(tabs)/index.tsx` | `region` state + bootstrap load; `runRefill` gains `activeRegion`; `handleToggleRegion`; render `RegionToggle` |
