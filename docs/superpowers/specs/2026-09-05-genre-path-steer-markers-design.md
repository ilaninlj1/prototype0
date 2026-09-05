# Mark Steer Boundaries in the Genre Path Display

**Goal:** `deriveGenrePath` already forces a new visit at a steer entry, even when the genre matches the previous visit — but the Profile screen renders every visit boundary the same way (a plain `" → "` between genre names), so a same-genre steer reads as an accidental duplicate (`Pop → Pop`) instead of a deliberate re-anchor. Distinguish steer boundaries from ordinary transitions in the display. **Display only** — `deriveGenrePath`'s output shape, and everything that consumes it for ranking (`rankGenresByVisits`), is untouched.

**Scope:** `lib/discovery.ts` (one new function + type, additive), `lib/discovery.test.ts` (new coverage), `app/(tabs)/explore.tsx` (rendering only).

## Decision 1: one marker or two?

**Two distinct markers — a circle for `steer-artist`, a square for `steer-sound`** (shape, not color — see the rendering section below for why). The whole premise of the steering redesign was that wanting more of an artist and wanting more of a sound are different intents; `SwipeAction` already keeps them as two distinct values everywhere else in the system (history, ranking exclusions). Collapsing them into one generic "you steered here" marker would throw away exactly the distinction the rest of the app preserves, for no real savings — it's the same one-marker-per-segment slot either way.

## Decision 2: same-genre vs. cross-genre steer boundaries

**The marker is a per-segment prefix on the destination genre's name, not a special arrow.** A steer boundary is rendered identically whether the genre changed or not — a marker in front of the genre name that was deliberately steered into:

- Same genre: `Pop → (■) Pop → House` (drifted through Pop, deliberately re-anchored on Pop via "more like this sound," then moved on)
- Different genre: `Rock → (●) Pop → Jazz` (this is reachable: an artist's catalog can span genres, so browsing under an artist strategy can drift across genres on its own before you steer on one of them)

Prefixing the destination handles both cases with one rule — no special-casing on whether the adjacent genre names match, and the ordinary (non-steer) arrow stays exactly as it is today.

## `lib/discovery.ts`: `deriveGenrePathSegments`, additive only

`deriveGenrePath` is unchanged — `rankGenresByVisits` keeps calling it directly. A new function, using the identical boundary rule, additionally tags which action (if any) opened each visit:

```ts
export type GenrePathSegment = {
  genre: string;
  openedBy: 'steer-artist' | 'steer-sound' | null;
};

/**
 * Same boundary rule as deriveGenrePath (a steer entry always opens a new
 * visit; a non-steer entry merges when the genre matches), but for display:
 * each segment is tagged with which steer action opened it, or null for an
 * ordinary transition. Only the Profile screen's path rendering uses this —
 * ranking (rankGenresByVisits) goes through deriveGenrePath directly, since
 * trackCount/listenMs (which this doesn't need) matter there and openedBy
 * doesn't.
 */
export function deriveGenrePathSegments(entries: SwipeEntry[]): GenrePathSegment[] {
  const segments: GenrePathSegment[] = [];
  for (const entry of entries) {
    const isSteer = entry.action === 'steer-artist' || entry.action === 'steer-sound';
    const last = segments[segments.length - 1];
    const continuesRun = last && last.genre === entry.genre && !isSteer;
    if (!continuesRun) {
      segments.push({ genre: entry.genre, openedBy: isSteer ? entry.action : null });
    }
  }
  return segments;
}
```

This duplicates `deriveGenrePath`'s boundary condition rather than deriving from its output, because the two now answer genuinely different questions (ranking needs `trackCount`/`listenMs`; display needs `openedBy`) and zipping them back together by array index would be more fragile than the ~5-line duplication is costly. Flagging the duplication here rather than hiding it: if the boundary rule ever changes, both functions need the same edit.

## `app/(tabs)/explore.tsx`: rendering — theme-token shapes, not emoji

Emoji are out: they carry their own color and sizing independent of the app's dark-only design system, and render inconsistently across platforms — exactly the kind of inconsistency `constants/theme.ts` was written to eliminate elsewhere. The marker has to be built from existing tokens instead.

**Shape, not color, tells artist from sound.** The palette deliberately has one accent (`Colors.accent`) — `constants/theme.ts`'s own comment: *"One accent for everything that used to fight over green/blue/teal."* Introducing a second hue just for this would cut against that. Both markers use `Colors.accent`; a **circle** marks `steer-artist`, a **square** marks `steer-sound` — distinct enough at a glance without adding a color.

**A real `View`, not a text glyph.** `deriveGenrePathSegments`'s output is UI-agnostic and unaffected by this change. But rendering the marker as an actual small `View` (not a character inside `Text`) removes font-rendering dependence entirely — a colored circle/square looks identical on every platform, where even a plain Unicode glyph still rides on whatever font is active. This does mean restructuring the path chain from one `Text` with nested spans (relies on RN's Text-in-Text inlining) to a wrapping flex row: a `View` can't nest inside `Text` and wrap inline with it, so each segment becomes its own small row (arrow + marker + genre name kept together) inside a `flexWrap: 'wrap'` container. Incidental benefit: wrapping now breaks between whole segments, never stranding an arrow or marker alone at a line break.

```tsx
const MARKER_SIZE = Spacing.sm; // sized off the spacing scale, not a magic number

function GenrePathChain({ entries }: { entries: SwipeEntry[] }) {
  const segments = deriveGenrePathSegments(entries);
  return (
    <ThemedView style={styles.pathRow} backgroundColor="transparent">
      {segments.map((segment, i) => (
        <ThemedView key={i} style={styles.pathSegment} backgroundColor="transparent">
          {i > 0 && <ThemedText style={styles.pathArrow}>→</ThemedText>}
          {segment.openedBy && (
            <ThemedView
              style={[
                styles.marker,
                segment.openedBy === 'steer-artist' ? styles.markerArtist : styles.markerSound,
              ]}
            />
          )}
          <ThemedText style={styles.pathText}>{segment.genre}</ThemedText>
        </ThemedView>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // ...existing styles...
  pathRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.xs,
    rowGap: Spacing.xs,
  },
  pathSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pathArrow: {
    color: Colors.textSecondary,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    backgroundColor: Colors.accent,
  },
  markerArtist: {
    borderRadius: Radius.pill, // circle
  },
  markerSound: {
    borderRadius: 0, // square
  },
});
```

Used in place of `{genrePathLabel(currentSession.entries)}` and `{genrePathLabel(session.entries)}` in both the current-session line and each row of the "All sessions" list; `genrePathLabel` is deleted.

## Testing

`lib/discovery.test.ts`, mirroring `deriveGenrePath`'s existing test shapes:
- A steer entry's segment carries the right `openedBy` value (`steer-artist` vs. `steer-sound`), a non-steer entry's segment has `openedBy: null`.
- A steer entry with the same genre as the previous segment still gets its own segment (`Pop, Pop` → two segments, both genre `'Pop'`).
- A steer entry with a different genre than the previous segment behaves the same as any other genre change, plus carries `openedBy`.
- A non-steer entry following a steer-opened segment merges into it (`openedBy` stays whatever opened the segment — the merge doesn't clear it).
- Empty input returns `[]`.

No test file exists for `app/(tabs)/explore.tsx` or any other screen component in this repo (only pure `lib/`/logic modules are unit-tested) — the rendering change is verified visually instead, per usual for this codebase.

## Testing environment: browser-only, nothing device-only here

This change is plain `View`/`Text` layout with `StyleSheet` colors and dimensions — no native gesture, audio, or platform API, and (deliberately) no font-rendering dependence either. Verifiable with `npm run web` (or `expo start` → `w`) in a browser: seed a few sessions with a mix of ordinary transitions, same-genre steers, and cross-genre steers, and confirm the circle and square are distinguishable, both read clearly against the dark background, and the chain still wraps sensibly (breaking between segments, not mid-segment) at various widths. Nothing here needs a physical device or simulator.

## Out of scope

- Any change to `deriveGenrePath`, `rankGenresByVisits`, or any other consumer of the un-annotated visit list.
- A legend/tooltip explaining the markers — if they read as unclear once there's real data to look at, that's a follow-up, not part of this pass.
- Touching the top-tile stats, artist list, or "played to the end" list — this is scoped to the genre-path chain only.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | New `GenrePathSegment` type and `deriveGenrePathSegments` function (additive) |
| `lib/discovery.test.ts` | New test cases per above |
| `app/(tabs)/explore.tsx` | `genrePathLabel` replaced by `GenrePathChain`, used in both path-rendering spots |
