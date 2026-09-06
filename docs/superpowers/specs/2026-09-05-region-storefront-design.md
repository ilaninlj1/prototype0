# Region Toggle: Pull the Feed from a Different Apple Storefront

**Goal:** the "sleeper" idea (bias the feed toward deeper cuts) doesn't work via `offset` — verified dead against the live API (see below). The `country` parameter on the same endpoint is real, documented, and does something: switching storefronts can surface a genuinely different set of artists for the same genre term. Ship it as a regional-listening feature in its own right — an artist big in one market and unknown in another is genuinely undiscovered to that listener, which is what "sleeper" was actually after.

**Scope:** `lib/discovery.ts` (`Region` type, `fetchTracksByGenre`/`fetchTracksByArtist`/`fetchForStrategy` gain a region param), `lib/discovery-storage.ts` (`loadRegion`/`saveRegion`), `components/discovery/region-toggle.tsx` (new), `app/(tabs)/index.tsx` (bootstrap, `runRefill`, toggle handler, render).

## Verification

### `offset`: dead (confirmed again, not just trusted from the existing comment)

`term=House&limit=25` and `term=Jazz&limit=200` (the app's actual configuration), each at `offset` 0/75/150/400: **byte-identical results at every offset**, both terms. `offset` isn't a documented parameter of this endpoint — it's silently accepted and discarded. No further exploration of it.

### `country`: real, but divergence is uneven

`term=reggaeton&limit=50`, storefronts US / CO / PR / MX:

| Pair | Distinct-artist overlap | Top-15 track overlap |
|---|---|---|
| US vs CO | 97.2% (35/36) | 14/15 |
| US vs MX | 56.2% (27/48) | 8/15 |

- **CO ≈ US** — nearly the identical top list (Daddy Yankee, Wisin & Yandel, Ozuna, Don Omar, J Balvin/Bad Bunny, in the same order). Not a useful control for this genre.
- **MX diverges meaningfully** — Cris MJ, Quevedo, Piso 21, Mora, J Alvarez, Ingratax, and others absent from the US list surface in the top 50.
- **PR is not a valid storefront** — `HTTP 400 {"errorMessage":"Invalid value(s) for key(s): [country]"}`. Puerto Rico has no separate Apple storefront; PR users are served by the US one. Never offerable as an option.

Divergence is real but not a blanket "any regional storefront works" — it depends on the specific pair, and only US/MX have actually been checked. **Scope: ship only the two verified codes.** Adding a third region later means verifying it live first, the same way MX was verified here — not assuming from a docs list.

### Track/album IDs are global, not storefront-scoped

Cross-checked identical songs by (artist, title) across US/CO/MX: `trackId` and `collectionId` were identical in every case checked (e.g. Nicky Jam & Enrique Iglesias – "El Perdón", Wisin & Yandel – "Ahora Es", Shakira – "Chantaje", ...). This is what makes the rest of the design simple: `seenTrackIds` dedup and `spreadByAlbum`'s recent-albums window need zero region-awareness — a track judged under one storefront is still correctly recognized if it resurfaces under another.

## `Region` type and the fetch layer

```ts
export type Region = 'US' | 'MX';
export const REGIONS: Region[] = ['US', 'MX'];
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

`deriveSeenTrackIds(history)` builds its set from `trackId`s in `swipeHistory` regardless of which region fetched them — and since IDs are global (verified above), a track judged under MX correctly stays excluded if it resurfaces under US. This doesn't thin out a newly-selected region's catalog: only the minority of tracks that are shared crossover hits between the two storefronts (56% overlap for reggaeton, per the numbers above) are even capable of colliding with prior history; region-unique tracks were never in that history to begin with. If a strategy genuinely couldn't produce enough fresh tracks after a switch, `refillQueueWithFallback`'s existing genre-fallback is already the safety net — nothing new needed for that case either.

## Persistence (`lib/discovery-storage.ts`)

Same pattern as `discoveredGenres` — best-effort, falls back to the default on any read failure or corrupt/unrecognized value:

```ts
const REGION_KEY = `${STORAGE_PREFIX}:region`;

export async function loadRegion(): Promise<Region> {
  try {
    const raw = await AsyncStorage.getItem(REGION_KEY);
    return raw === 'MX' ? 'MX' : 'US';
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
  const nextRegion: Region = region === 'US' ? 'MX' : 'US';
  setRegion(nextRegion);
  await saveRegion(nextRegion);
  // Same "keep the current card, drop the stale buffered tail, refill under
  // the new setting" shape as applySteeringStrategy.
  const preserved = queue.slice(0, 1);
  setQueue(preserved);
  await runRefill(preserved, strategy, swipeHistory, discoveredGenres, nextRegion);
}
```

`nextRegion` (the local variable), not the `region` state variable, is what's passed to `runRefill` — `setRegion` doesn't take effect synchronously within this same function call, and reading `region` here would still see the old value. `applySteeringStrategy` already avoids the equivalent trap for `strategy` by passing `next` explicitly rather than reading the `strategy` state; this follows the same precedent.

- Not part of `UndoSnapshot`. Undo rolls back a swipe or a steering choice — a momentary content action. The region toggle is a standing preference, closer in kind to a settings switch; conflating it with undo would blur two different categories of "changed my mind." Mis-tapping it is corrected by tapping it again.

## `components/discovery/region-toggle.tsx` (new)

Same visual pattern as `UndoButton`/`LikedTracksButton` — a persistent pill, positioned in the one corner nothing currently occupies:

```tsx
type RegionToggleProps = {
  region: Region;
  onToggle: () => void;
};

/** Persistent bottom-left pill — the one corner Undo/GenrePicker/Liked don't already occupy. Shows the current storefront; tap flips it. */
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

`fetchTracksByGenre`/`fetchTracksByArtist`/`fetchForStrategy` make real network calls and, consistent with the rest of this file, aren't unit-tested directly today (only their pure JSON-parsing counterparts — `parseGenreSearchResponse`/`parseArtistLookupResponse` — and `refillQueue`/`refillQueueWithFallback`, via injected fake fetchers, are). This change is a defaulted-parameter extension to those same untested functions, not new logic, so no new test file is warranted for them. `loadRegion`/`saveRegion` mirror `discoveredGenres`'s persistence functions, which also have no dedicated test file. Verified via typecheck + lint + manual check in a browser (`npm run web`): toggle flips the pill's label, persists across a reload, and the fetched genre's results visibly change between US and MX for a term like "reggaeton."

## Out of scope

- Any third storefront — requires its own live verification pass first.
- A picker UI for more than two options — the binary toggle is honest to what's actually been verified; revisit the UI shape if/when a third region is added.
- Any change to `spreadByAlbum`, `refillQueue`, `refillQueueWithFallback`, or `GENRE_TERM_OVERRIDES` — confirmed above that none is needed.
- Undo integration for the region toggle.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | `Region`, `REGIONS`, `DEFAULT_REGION`; `fetchTracksByGenre`/`fetchTracksByArtist`/`fetchForStrategy` gain a defaulted `region` param |
| `lib/discovery-storage.ts` | `loadRegion`, `saveRegion` |
| `components/discovery/region-toggle.tsx` | New |
| `app/(tabs)/index.tsx` | `region` state + bootstrap load; `runRefill` gains `activeRegion`; `handleToggleRegion`; render `RegionToggle` |
