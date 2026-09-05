# Liked Tracks: Multi-Select, Bulk Export, and Export History

**Goal:** Long-press to multi-select rows on the liked tracks list, bulk-export the selection (Apple Music + Spotify), and archive an exported set as a browsable, dated batch — clearing it from the active liked list.

**Research finding (gates this whole spec):** Neither Spotify nor Apple Music has an unauthenticated URL scheme that adds multiple tracks anywhere. Confirmed against Spotify's own docs and community reports, and Apple's developer forums — see the prior message for sources. Real bulk-add requires Spotify's Web API (user OAuth) or MusicKit + a paid Apple Developer account, either of which is the bigger, separate feature already logged in `features.md`. This app also has no real Spotify track ID at all (today's per-track "Spotify" link is a search URL, not a track link) — resolving one would need Spotify's Search API, which itself needs app-level credentials. Proceeding on "ok go" (no credentials supplied) means: **export is a shareable/copyable list, not a one-tap add.**

**Scope:** `app/modal.tsx`, new `app/export-history.tsx`, new `components/discovery/track-row.tsx` (extracted, since both screens now render the same row), `lib/discovery-storage.ts`. No OAuth, no new dependencies.

## 1. Multi-select

- Long-pressing a row (not currently in selection mode) enters selection mode and selects that row. `TouchableOpacity`'s `onLongPress`.
- While in selection mode, tapping any row toggles its selection instead of playing it; each row's play button and Apple Music/Spotify links are disabled (dimmed, non-interactive) to avoid ambiguous nested-tap conflicts with select-by-tap. Swipe-to-delete is also disabled while in selection mode — bulk delete replaces it for this mode.
- A toolbar row (plain in-content view, not a native header customization) replaces the top of the list while active: "`N` selected", **Export**, **Delete**, and **Cancel** (clears selection, exits the mode).
- Selection state (`Set<number>` of track ids) and `selectionMode: boolean` are local `useState` in the screen — no persistence, resets on navigating away.

## 2. Bulk export (lightweight, no auth)

Tapping **Export** in the toolbar:

1. Builds a plain-text summary of the selected tracks, newest-first, each with both links:
   ```
   My liked tracks (7)

   1. "Song Title" — Artist Name
      Apple Music: https://music.apple.com/...
      Spotify: https://open.spotify.com/search/...

   2. ...
   ```
   (A track missing `trackViewUrl` — pre-dates that field — just omits the Apple Music line for that entry.)
2. Tries `Share.share({ message })` (`Share` from `react-native`) — opens the native share sheet on iOS/Android, and on web delegates to `navigator.share()` where the browser supports it.
3. If that rejects (cancelled, or — the web case — `navigator.share` isn't available at all: desktop Firefox, some desktop Chrome contexts), falls back to a small in-app modal showing the same text in a `selectable` `Text` block, with a "Done" button, so the user can manually select-and-copy. No new dependency (e.g. a clipboard package) for this — plain selectable text is enough and keeps this from ballooning in scope.
4. Either way (shared, fallen back to manual copy, or even cancelled), proceeds to step 3 below — the confirm step is the real safety gate here, not whatever the OS share sheet reports back, which isn't reliably detectable across platforms anyway.

## 3. Export batches

After the export attempt, confirm via the same cross-platform `confirmDialog` already built for delete: **"Move 7 tracks to export history and clear them from your liked list?"** (Cancel / Confirm). On confirm:

- Build `{ id: String(exportedAt), exportedAt: Date.now(), tracks: selectedTracks }` and persist it via a new `appendExportBatch` (same load-then-push-then-save pattern as `appendLikedTrack`).
- Remove exactly the exported tracks (not necessarily the whole list — a partial selection is respected) from the liked list via the existing `saveLikedTracks`, same as the single-track delete flow.
- Exit selection mode.

On cancel: nothing changes — no batch saved, liked list untouched, selection stays as-is so the user can adjust and retry.

### Browsable history — new `app/export-history.tsx`

- New route (plain file under `app/`), registered as a modal `Stack.Screen` in `app/_layout.tsx` (`title: 'Export History'`), consistent with how `app/modal.tsx` is presented. Reachable via a small text link on the liked tracks screen (near the top, alongside the existing trigger buttons).
- Reload-on-focus via `useFocusEffect`, same pattern as the liked tracks screen and Profile tab.
- Lists batches newest-first: each row shows the date (`toLocaleDateString()`) and track count, tappable to expand inline (same collapsible interaction the genre picker already uses) revealing that batch's tracks.
- Expanded tracks render via the extracted `TrackRow` (see below) in read-only mode — playable and linkable for reference, but no delete/select, since this is a historical record, not an active list.

### Extracting `TrackRow`

`app/modal.tsx`'s row (artwork, title/artist/genre, Apple Music/Spotify links, play/pause button) is needed as-is by `export-history.tsx` too. Pulling it into `components/discovery/track-row.tsx`:

```ts
type TrackRowProps = {
  track: DiscoveryTrack;
  isPlaying: boolean;
  onTogglePlay: () => void;
  disabled?: boolean; // dims play/links during multi-select
};
```

`app/modal.tsx` wraps `TrackRow` in its existing `ReanimatedSwipeable` (delete) and the new selection-tap handling; `export-history.tsx` renders it bare, no wrapper.

## Data

```ts
export type ExportBatch = {
  id: string;
  exportedAt: number;
  tracks: DiscoveryTrack[];
};
```

`lib/discovery-storage.ts` gains `loadExportBatches()` / `appendExportBatch(batch)` under a new `blindspotDiscovery:exportBatches` key, mirroring `loadLikedTracks`/`appendLikedTrack`.

## Files touched

| File | Change |
|---|---|
| `lib/discovery-storage.ts` | Add `loadExportBatches`, `appendExportBatch` |
| `components/discovery/track-row.tsx` | New — extracted row, shared by both screens |
| `app/modal.tsx` | Multi-select mode, toolbar, bulk delete/export, confirm-and-archive flow, history link |
| `app/export-history.tsx` | New — browsable batch list with inline expansion |
| `app/_layout.tsx` | Register the `export-history` modal route |

## Out of scope

- Real OAuth/MusicKit bulk-add — the separate, bigger feature already in `features.md`.
- Editing or deleting a saved export batch once created.
- Any attempt to resolve real Spotify track IDs (would need Spotify API credentials, not supplied).
