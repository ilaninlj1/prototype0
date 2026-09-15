# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm start` — start the Expo dev server (Metro). Press `i`/`a`/`w` in the terminal, or use the targeted scripts below.
- `npm run ios` / `npm run android` / `npm run web` — start the dev server and open the app in a specific target.
- `npm run lint` — run ESLint via `expo lint` (flat config in `eslint.config.js`, extends `eslint-config-expo`).
- `npm run reset-project` — one-way scaffolding reset: moves `app/`, `components/`, `hooks/`, `constants/`, `scripts/` to `app-example/` and regenerates a blank `app/`. Only run this if the user explicitly asks to blank out the starter template.
- Pool-steering control's Phase 0 pipeline (dev-only, not shipped in the app) — three steps, run in order: `npm run seed-genres` (fetches + resolves Last.fm data into `assets/genres-raw.json`, needs `EXPO_PUBLIC_LASTFM_API_KEY`, ~15min) → `npm run resolve-itunes-ids` (resolves an iTunes artistId per distinct artist into the same file, no API key, resumable, takes hours — safe to interrupt and re-run) → `npm run band-genres` (applies thresholds, writes `assets/genres.json`, instant, local, re-runnable while tuning `lib/pool-config.ts`). `npm run report-itunes-resolution` reads iTunes-resolution progress at any point without writing anything.

There is no build/typecheck script configured (`npx tsc --noEmit` can be run directly against `tsconfig.json` if needed). Tests run via Node's built-in runner against the untranspiled `.ts` sources: `node --experimental-strip-types --test lib/discovery.test.ts` (there's no aggregate `npm test` yet — run a file directly).

## Architecture

This is Blindspot, built on Expo Router (v6), with two tabs: **Home**, a Tinder-style swipe discovery feed, and **Profile**, its listening-data view. A blind-quiz mode also exists in the codebase (`lib/taste-test.ts`) but is not reachable from any current route — see the note at the end of this section before assuming it's live.

- **Routing**: `app/_layout.tsx` is the root `Stack`, wrapping everything in a fixed dark `ThemeProvider` (see Theming below — there is no light/dark switching). It declares the `(tabs)` group (header hidden) plus two modal routes: `modal` ("Liked Tracks") and `export-history` ("Export History"). `unstable_settings.anchor` is `(tabs)`.
- **Tabs**: `app/(tabs)/_layout.tsx` — `Home` (`index.tsx`) and `Profile` (`explore.tsx`), via `HapticTab` and `IconSymbol`.
- **Home tab (`app/(tabs)/index.tsx`)**: the swipe discovery feed. Renders `CardStack`/`SwipeCard` (`components/discovery/`) over a queue of `DiscoveryTrack`s maintained by `lib/discovery.ts`'s queue engine (`refillQueue`/`refillQueueWithFallback`). Session state starts on a random genre `Strategy` — `GENRES` from `lib/taste-test.ts` is the only export of that file still imported anywhere — fetched via `fetchForStrategy`, which dispatches to `fetchTracksByGenre` for a genre strategy or `fetchTracksByArtist` for an artist strategy (steering). **`fetchTracksByGenre`'s bare term-search is a known live bug** (see `bugs.md`'s 2026-09-14 entry) — it's slated to be superseded, not patched, by the pool-steering control below.
  - Swipe left = skip, right = like (`appendLikedTrack`), down = jump to a new genre (`pickJumpGenre`, weighted toward genres not yet heard this session).
  - `SteeringRow` offers "more from this artist" / "more like this sound" without requiring a swipe.
  - `GenrePicker` (`components/discovery/genre-picker.tsx`, taxonomy in `genre-taxonomy.ts`) lets the user jump directly to a curated genre, a taxonomy group, or a previously-`Discovered` one (a raw iTunes `primaryGenreName` string outside the curated list).
  - `RegionToggle` switches the iTunes storefront (`Region`: US/MX/ZA — `docs/superpowers/specs/2026-09-05-region-storefront-design.md`).
  - `LikedTracksButton` opens the `modal` route.
- **`modal` route (`app/modal.tsx`, "Liked Tracks")**: review/remove liked tracks (`loadLikedTracks`/`saveLikedTracks`), share or export them as a batch (`appendExportBatch`), link to `export-history`.
- **`export-history` route (`app/export-history.tsx`)**: past export batches (`loadExportBatches`).
- **Profile tab (`app/(tabs)/explore.tsx`)**: the discovery feed's listening-data view (not a blind-quiz results screen), reloading on every focus — total tracks logged, average listen time, genres discovered, top genres by listen time/visit count, top artists, and the genre-jump path for the session — all derived from `lib/discovery-storage.ts`'s `loadSwipeHistory`/`loadDiscoveredGenres` via `lib/discovery.ts`'s pure `derive*`/`rank*` functions.
- **`lib/discovery.ts`**: the core engine — `DiscoveryTrack`/`SwipeEntry`/`Strategy` types, the iTunes fetch layer (`fetchTracksByGenre`, `fetchTracksByArtist`, `fetchForStrategy`), the queue engine (refill, album-spread, genre-jump selection), and the `derive*`/`rank*` functions Profile reads. Tested via `lib/discovery.test.ts` (Node's built-in test runner, see Commands above).
- **`lib/discovery-storage.ts`**: all `AsyncStorage` persistence for the discovery feed — swipe history, discovered genres, liked tracks, export batches. Same best-effort convention as the rest of the codebase: a read/write failure falls back to empty rather than throwing.
- **`lib/taste-test.ts`**: mostly vestigial. Its blind-quiz flow (setup → playing → reveal → summary), persistence, and scoring (`isMismatch`) aren't imported anywhere in `app/`. Only `GENRES`, the curated genre list, is still live — reused by the Home tab's genre picker/jump logic and by the pool-steering control's Phase 0 seed script. Treat this file as off-limits by longstanding convention regardless of reachability; just don't assume the rest of this file describes a running feature.
- **Pool-steering control (in progress, 2026-09-14 on)**: a discrete 4-preset control over artist popularity × song rank, replacing — not augmenting — the genre-strategy fetch path above (see `features.md`/`bugs.md`'s 2026-09-14 entries and `docs/superpowers/specs/2026-09-07-taste-space-design.md`'s correction note for how this relates to the earlier, unbuilt "Taste Space" continuous-dial design). So far: `lib/pool-types.ts`, `lib/pool-config.ts`, and the three-script Phase 0 pipeline above (dev-only, not shipped). `lib/pool.ts` (Phase 1, the runtime data layer) doesn't exist yet — see `features.md`'s 2026-09-14 entry on required iTunes call pacing before building it.
- **Path alias**: `@/*` maps to the project root (`tsconfig.json`), used throughout instead of relative imports.
- **Theming**: `constants/theme.ts` is a **dark-only** design system (deliberate — see the file's own header comment) — no `useColorScheme` hook exists anywhere in the project anymore. `components/themed-text.tsx`/`themed-view.tsx` still exist and are still the preferred primitives over raw `Text`/`View` (for consistent token usage), just not for light/dark adaptation.
- **Shared audio playback**: `hooks/use-playback.tsx`'s `PlaybackProvider` (wrapping the whole app in `app/_layout.tsx`) and `usePlayback` are the single shared player instance across Home, the liked-tracks modal, and export history — see `docs/superpowers/specs/2026-09-05-shared-audio-player-design.md`.
- **Platform-specific files**: the `.ios.tsx` suffix convention is in use (`components/ui/icon-symbol.ios.tsx`) — Metro picks the right file per platform automatically; add new platform variants the same way rather than branching on `Platform.OS` inside a shared file when the implementations diverge significantly.
- **Icons**: `components/ui/icon-symbol.tsx` wraps SF Symbols on iOS (via `icon-symbol.ios.tsx`) and maps to Material Icons on other platforms — new icon names must be added to the mapping in the non-iOS variant.
- New routes are added simply by creating a file under `app/` (or `app/(tabs)/` for another tab); Expo Router derives the route tree from the file structure, and `experiments.typedRoutes` in `app.json` generates typed route params into `.expo/types/router.d.ts`.

## Session start checklist

At the start of every session, check `bugs.md` and `features.md` in the project root for entries older than 30 days (entry format: `## [YYYY-MM-DD] Title`). If any are found, remind the user about them by name (title + date) before proceeding with other work.
