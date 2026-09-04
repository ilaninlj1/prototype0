# Genre Picker: Current-Genre Indicator, Grouping, and Explore

**Goal:** Four related changes to the genre picker: show the active genre on the swipe screen, scroll-to/highlight it when the picker opens, collapse the flat 37-entry list into expandable parent groups, and add a random-jump "Explore" entry.

**Scope:** `components/discovery/genre-picker.tsx` and `app/(tabs)/index.tsx`. New `components/discovery/genre-taxonomy.ts` (pure data + grouping logic, unit-testable — mirrors how `swipe-physics.ts` sits alongside `swipe-card.tsx`). No changes to `lib/discovery.ts`'s search/queue engine.

## 1. Current-genre indicator

No new UI element. The picker's own trigger button (currently a static "Genres" label) becomes the indicator: its label is the current genre when `strategy.type === 'genre'`, or `"More from: <artistName>"` when `strategy.type === 'artist'`. One button does both jobs — showing where you are, and opening the picker to go somewhere else. Passed down as a new `currentLabel: string` prop computed in `index.tsx` from `strategy`.

## 2. Scroll-to + highlight on open

The target row (see taxonomy resolution below) gets a highlight style (a distinct background tint, not just the checkmark) and the sheet scrolls to it when the modal opens. Implementation: each row registers its measured Y offset via `onLayout` into a `Map` (ref, not state — measurement shouldn't trigger re-renders); once the modal's `visible` prop flips true *and* the target's containing group (if any) is expanded, `scrollViewRef.current.scrollTo({ y: measuredY, animated: true })`. Chose measurement over analytically computing offsets from row counts — more robust if row heights ever change, doesn't hard-code layout assumptions into the scroll logic.

## 3. Collapsible grouping

### Taxonomy (approved)

New `components/discovery/genre-taxonomy.ts`:

```ts
export type GenreTaxonomy = Record<string, string[]>; // parent -> curated children

export const GENRE_TAXONOMY: GenreTaxonomy = {
  Electronic: ['House', 'Deep House', 'Tech House', 'Techno', 'Dubstep', 'Drum and Bass', 'Disco', 'Ambient', 'Lo-Fi'],
  Rock: ['Shoegaze', 'Punk', 'Metal', 'Grunge', 'Indie Rock'],
  'Hip-Hop': ['Drill', 'Boom Bap'],
  'R&B': ['Funk', 'Soul'],
  Latin: ['Reggaeton', 'Salsa', 'Bachata', 'Cumbia'],
  Pop: ['Bedroom Pop', 'K-Pop'],
  World: ['Afrobeats', 'Amapiano'],
  Jazz: ['Bossa Nova'],
};
```

`Country`, `Classical`, `Gospel`, `Reggae` (curated but not assigned a parent) stay flat, top-level rows — not grouped, not sent to "Discovered".

### The "Discovered" bucket

`discoveredGenres` (grown from raw iTunes `primaryGenreName` strings — "Urbano latino", "Punjabi Pop", anything) can't be placed in a hand-written taxonomy that's never seen them. Any discovered genre that isn't a taxonomy parent, a taxonomy child, or one of the four flat curated leftovers above goes into a synthetic **"Discovered"** group at the bottom — same expandable-group treatment as the curated ones, just built from leftovers instead of a static list. Deliberately not a substring-guessing heuristic (the class of fragile matching this app already moved away from in `GENRE_TERM_OVERRIDES`) — an entry either matches the taxonomy exactly or it's Discovered. Omitted entirely (not rendered as an empty group) if there's nothing in it yet.

This means `GenrePicker` needs `curatedGenres` (the base `GENRES` list) and `discoveredGenres` kept **separate**, not pre-merged into one flat array like today's `allGenres` — merging them loses the provenance needed to tell "Country" (curated, stays flat) apart from "Urbano latino" (discovered, goes to Discovered). `index.tsx` drops its `allGenres` useMemo and passes both arrays through directly.

### Data shape

```ts
export type GenreSection =
  | { type: 'leaf'; genre: string }
  | { type: 'group'; label: string; genre: string | null; children: string[] };

export function buildGenreSections(
  curatedGenres: string[],
  discoveredGenres: string[],
  taxonomy: GenreTaxonomy
): GenreSection[]
```

`genre: string | null` on a group distinguishes a taxonomy parent (`genre` equals its own label — e.g. `{ label: 'Rock', genre: 'Rock', children: [...] }`, since "Rock" is itself a real, directly-searchable genre) from the synthetic "Discovered" label (`genre: null` — not a real search term, heading-only).

### Selecting vs. expanding a group

Not addressed by "expand on tap" alone: parent genres like Rock/Pop/Electronic are themselves valid, already-searchable genres today (they're in the base `GENRES` list) — turning them into group headers shouldn't quietly remove the ability to pick them directly. So a group row has two independent tap targets: the label text selects that genre (only when `genre !== null`) and closes the picker, same as any leaf; a separate disclosure chevron (▸/▾) toggles expand/collapse without selecting. "Discovered" (`genre: null`) only has the chevron behavior — there's no genre value tapping its label could mean.

### Expand state

All groups start collapsed except the one containing the current genre (if it's a child, not a parent — a parent's own row is already visible without expanding). Toggling is local `useState<Set<string>>` in `GenrePicker`, keyed by group label.

## 4. "Explore"

A plain pinned row above every section (not part of `GenreSection[]`, not a group — it's an action, not genre data), visually distinguished (accent color) from genre rows. Reuses `pickJumpGenre`'s existing weighted-random selection — the same algorithm swipe-down already uses — through a new `handleExplore` in `index.tsx`, mirroring `handleGenreJump`'s structure but sourced from `currentTrack` optionally (like `handlePickGenre`, since it's triggered from the picker, not a gesture with a guaranteed track):

```ts
async function handleExplore() {
  captureUndoSnapshot();
  setShowActionButtons(false);
  const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
  const nextGenresHeard = deriveGenresHeard(nextHistory); // broad "explored" set — same one swipe-down uses, not deriveRatedGenres
  const target = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
  await commitGenreJump(target, nextHistory);
}
```

Undo-covered and overlay-dismissing, same as every other queue-changing action.

## Component API changes

```ts
type GenrePickerProps = {
  curatedGenres: string[];     // was: pre-merged `genres`
  discoveredGenres: string[];  // new — kept separate for provenance
  heardGenres: Set<string>;
  currentGenre: string | null; // strategy.type === 'genre' ? strategy.genre : null
  currentLabel: string;        // trigger button text — genre name or "More from: X"
  onSelect: (genre: string) => void;
  onExplore: () => void;
};
```

## Files touched

| File | Change |
|---|---|
| `components/discovery/genre-taxonomy.ts` | New — `GENRE_TAXONOMY`, `GenreSection`, `buildGenreSections` |
| `components/discovery/genre-taxonomy.test.ts` | New — coverage for `buildGenreSections` (flat leftovers, Discovered bucket, no duplicate when a discovered string coincidentally matches a curated one, empty Discovered omitted) |
| `components/discovery/genre-picker.tsx` | Trigger label, expandable sections, chevron vs. select, scroll-to/highlight, Explore row |
| `app/(tabs)/index.tsx` | Drop `allGenres`; pass `GENRES`/`discoveredGenres` separately; `currentLabel`/`currentGenre` derived from `strategy`; new `handleExplore` |

## Out of scope

- Nesting deeper than one level (groups don't contain sub-groups).
- Any indicator on the artist-strategy path beyond the trigger label itself (no artist-specific picker UI).
- Persisting expand/collapse state across picker opens (always resets, only the current-genre group starts pre-expanded).
