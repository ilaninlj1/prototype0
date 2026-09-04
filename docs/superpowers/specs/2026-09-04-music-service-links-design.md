# Apple Music / Spotify Links on Liked Tracks

**Goal:** Let each row on the liked tracks list link out to Apple Music and Spotify for that track.

**Scope:** Bounded addition to `lib/discovery.ts` (one new field, one new pure helper) and `app/modal.tsx` (the liked tracks screen). No OAuth, no API calls beyond what iTunes search already returns — this is not the Spotify/Apple Music export feature already logged separately in `features.md` (that needs auth and catalog matching; this is just two outbound links).

## Data

iTunes search already returns `trackViewUrl` per result (verified against the live endpoint — a real `music.apple.com` link), but `toDiscoveryTrack` in `lib/discovery.ts` doesn't currently map it. Add it:

```ts
export type DiscoveryTrack = {
  // ...existing fields
  trackViewUrl: string;
};
```

Mapped in `toDiscoveryTrack` the same way every other field is (`r.trackViewUrl`). Required in the type, same as `artworkUrl100` — but the render still guards for a falsy value, since liked tracks already saved to `blindspotDiscovery:likedTracks` before this change won't have it in storage (`JSON.parse`d data isn't shape-checked against the type anywhere in this codebase, so old records legitimately can lack fields the type says are required).

## Spotify URL

No API or OAuth — a plain search deep link. New pure function in `lib/discovery.ts`, unit-tested like the rest of that file:

```ts
export function buildSpotifySearchUrl(artistName: string, trackName: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${trackName}`)}`;
}
```

## UI (`app/modal.tsx`)

Each row gets a small links line beneath the genre text: "Apple Music" and "Spotify", each only rendered if its URL resolves to something truthy (Apple Music needs `track.trackViewUrl`; Spotify's is always constructible from artist+title, so it always shows). Reuses `ThemedText`'s existing `type="link"` style rather than inventing new colors. Tapping calls `Linking.openURL(url).catch(() => {})` (`Linking` from `react-native` — hands off to the installed app when available, browser fallback otherwise; not `expo-web-browser`, which would open an in-app tab instead of leaving the app).

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | `trackViewUrl` field + mapping; new `buildSpotifySearchUrl` |
| `lib/discovery.test.ts` | Coverage for `buildSpotifySearchUrl`; update the test file's `track()` helper to include `trackViewUrl` |
| `app/modal.tsx` | Render the two links per row |

## Out of scope

- Any form of auth, playlist add, or "liked songs" sync to either service.
- A fallback UI for tracks entirely missing both URLs (Spotify's is always derivable; only Apple Music's can be missing, and it's simply omitted).
