# Mark Steer Boundaries in the Genre Path Display

**Goal:** `deriveGenrePath` already forces a new visit at a steer entry, even when the genre matches the previous visit — but the Profile screen renders every visit boundary the same way (a plain `" → "` between genre names), so a same-genre steer reads as an accidental duplicate (`Pop → Pop`) instead of a deliberate re-anchor. Distinguish steer boundaries from ordinary transitions in the display. **Display only** — `deriveGenrePath`'s output shape, and everything that consumes it for ranking (`rankGenresByVisits`), is untouched.

**Scope:** `lib/discovery.ts` (one new function + type, additive), `lib/discovery.test.ts` (new coverage), `app/(tabs)/explore.tsx` (rendering only).

## Decision 1: one marker or two?

**Two distinct markers — 👤 for `steer-artist`, 🎵 for `steer-sound`.** The whole premise of the steering redesign was that wanting more of an artist and wanting more of a sound are different intents; `SwipeAction` already keeps them as two distinct values everywhere else in the system (history, ranking exclusions). Collapsing them into one generic "you steered here" glyph would throw away exactly the distinction the rest of the app preserves, for no real savings — it's the same one-icon-per-segment slot either way.

## Decision 2: same-genre vs. cross-genre steer boundaries

**The marker is a per-segment prefix on the destination genre's name, not a special arrow.** A steer boundary is rendered identically whether the genre changed or not — an icon in front of the genre name that was deliberately steered into:

- Same genre: `Pop → 🎵 Pop → House` (drifted through Pop, deliberately re-anchored on Pop, then moved on)
- Different genre: `Rock → 👤 Pop → Jazz` (this is reachable: an artist's catalog can span genres, so browsing under an artist strategy can drift across genres on its own before you steer on one of them)

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

## `app/(tabs)/explore.tsx`: rendering

`genrePathLabel` (currently: join `deriveGenrePath(entries).map(v => v.genre)` with `" → "`, returning a plain string) is replaced by a small component that renders `deriveGenrePathSegments` as nested `ThemedText` spans, so each segment can carry its own icon prefix inline within one wrapped line:

```tsx
const STEER_ICON: Record<'steer-artist' | 'steer-sound', string> = {
  'steer-artist': '👤',
  'steer-sound': '🎵',
};

function GenrePathChain({ entries }: { entries: SwipeEntry[] }) {
  const segments = deriveGenrePathSegments(entries);
  return (
    <ThemedText style={styles.pathText}>
      {segments.map((segment, i) => (
        <ThemedText key={i} style={styles.pathText}>
          {i > 0 ? ' → ' : ''}
          {segment.openedBy ? `${STEER_ICON[segment.openedBy]} ` : ''}
          {segment.genre}
        </ThemedText>
      ))}
    </ThemedText>
  );
}
```

Used in place of `{genrePathLabel(currentSession.entries)}` and `{genrePathLabel(session.entries)}` in both the current-session line and each row of the "All sessions" list. No style/layout changes beyond this — same `pathText` styling, same wrapping behavior (nested `Text` in React Native wraps as one paragraph, so this doesn't change how the line breaks).

## Testing

`lib/discovery.test.ts`, mirroring `deriveGenrePath`'s existing test shapes:
- A steer entry's segment carries the right `openedBy` value (`steer-artist` vs. `steer-sound`), a non-steer entry's segment has `openedBy: null`.
- A steer entry with the same genre as the previous segment still gets its own segment (`Pop, Pop` → two segments, both genre `'Pop'`).
- A steer entry with a different genre than the previous segment behaves the same as any other genre change, plus carries `openedBy`.
- A non-steer entry following a steer-opened segment merges into it (`openedBy` stays whatever opened the segment — the merge doesn't clear it).
- Empty input returns `[]`.

No test file exists for `app/(tabs)/explore.tsx` or any other screen component in this repo (only pure `lib/`/logic modules are unit-tested) — the rendering change is verified visually instead, per usual for this codebase.

## Testing environment: browser-only, nothing device-only here

This change touches only text/emoji rendering inside `ThemedText` — no native gesture, audio, or platform API. Verifiable with `npm run web` (or `expo start` → `w`) in a browser: seed a few sessions with a mix of ordinary transitions, same-genre steers, and cross-genre steers, and confirm both icons render distinctly and the chain still wraps sensibly at various widths. Nothing here needs a physical device or simulator.

## Out of scope

- Any change to `deriveGenrePath`, `rankGenresByVisits`, or any other consumer of the un-annotated visit list.
- A legend/tooltip explaining the icons — if they read as unclear once there's real data to look at, that's a follow-up, not part of this pass.
- Touching the top-tile stats, artist list, or "played to the end" list — this is scoped to the genre-path chain only.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | New `GenrePathSegment` type and `deriveGenrePathSegments` function (additive) |
| `lib/discovery.test.ts` | New test cases per above |
| `app/(tabs)/explore.tsx` | `genrePathLabel` replaced by `GenrePathChain`, used in both path-rendering spots |
