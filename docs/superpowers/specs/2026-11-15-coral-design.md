# Coral: join two songs and play the branch

2026-11-15. Branch `coral`, worktree `~/Desktop/prototype0-coral`. Showcase is Dec 3.

## What it is

In the Ocean you can join two songs you saved. Each join grows a coral branch between them. Dragging a finger along
a branch fades from one song to the other, with the same equal-power fade Home's left drag uses. Where branches meet
at a song, the finger carries on into the next branch, so tracing a path across the coral plays a mix you built.

It opens from the Ocean as its own full-screen underwater view (route `/coral`), the way the whole-ocean graph does.
It is not drawn inside the live Ocean scene: creatures there swim, and `ocean-draw.ts` is a frame worklet that only
crashes on a phone when a rule is broken.

The Ocean's existing coral (songs revealed but not kept, `CoralPiece` in `lib/ocean-person.ts`) is unchanged.

## Rules

- A link joins two different saved songs. The same pair can't be linked twice, in either order. At most `MAX_LINKS`.
- Link type: **Fade** follows the finger. **Cut** switches from a to b at the middle of the branch.
- Each end has a start point, seconds into that song's 30 second clip, so you choose which part comes in.
- Only two songs are ever audible. No tempo matching, no audio editing, no new native dependency.
- The coral is a pure function of the links: the same links always draw the same coral.
- Songs are colored by the app's existing per-song color. A song still blind stays unnamed here, as it does in the
  Ocean's creature sheet.

## Contract

Types live in `lib/coral-types.ts`. Do not change them without saying so in your report.

### Lane 1, model: `lib/coral.ts`, `lib/coral.test.ts`, `hooks/use-coral.ts`

Pure functions, tested with Node's runner (`node --experimental-strip-types --test lib/coral.test.ts`).

```ts
emptyCoral(): CoralState
parseCoral(raw: string | null): CoralState                     // never throws; bad data gives emptyCoral()
canLink(state, a: CoralSong, b: CoralSong): 'ok' | 'same' | 'linked' | 'full'
addLink(state, a, b, type, now: number): CoralState            // unchanged state when canLink isn't 'ok'
removeLink(state, linkId): CoralState
setLinkType(state, linkId, type): CoralState
setLinkStart(state, linkId, end: 'a' | 'b', seconds): CoralState   // clamped to 0..MAX_START
layoutGarden(links: CoralLink[], width, height): GardenLayout
hitBranch(layout, x, y, reach): CoralTouch | null              // nearest branch within reach
hitNode(layout, x, y, reach): number | null                    // trackId
traceStep(layout, prev: CoralTouch | null, x, y, reach): CoralTouch | null
mixFor(type: LinkType, t: number): number                      // fade: t. cut: 0 below 0.5, 1 from 0.5
touchPoint(layout, touch): Point                               // where a touch sits on its branch
```

`layoutGarden`: coral grows up from the floor. Each connected group of songs is one colony rooted on the floor at
its oldest song; other songs branch upward and outward from it; a link that closes a loop arches between its two
songs. Nodes stay inside the box with a margin, don't overlap, and branches curve like coral, not straight lines.
`points` are 24 samples from a to b.

`traceStep`: a finger stays on its branch while it's within reach. Near an end (t under 0.08 or over 0.92) it may
move onto another branch that shares that song, landing at that branch's matching end. It never jumps to a branch
that doesn't share a song with the one it's on without lifting. Off every branch gives null.

`hooks/use-coral.ts`: a store outside React read with `useSyncExternalStore`, following `hooks/use-art.ts`.
AsyncStorage key `coral:v1`. Exports `useCoral(): CoralState`, and async `linkSongs(a, b, type)`,
`unlink(linkId)`, `changeLinkType(linkId, type)`, `changeLinkStart(linkId, end, seconds)`.

### Lane 2, sound: `lib/coral-mix.ts`, `lib/coral-mix.test.ts`, and `lib/playback-crossfade.ts` if needed

A controller over the shared player's existing crossfade (`hooks/use-playback.tsx`, `lib/playback-crossfade.ts`),
tested with a fake player the way `lib/playback-crossfade.test.ts` does.

```ts
type CoralPlayback = Pick<PlaybackContextValue, 'playPreview' | 'peekLoad' | 'setMix' | 'promotePeek' | 'cancelPeek' | 'stopPreview'>
createCoralMix(playback: CoralPlayback): {
  touch(blend: CoralBlend): void   // called on every finger move; cheap when nothing changed
  solo(song: CoralSong): void      // a tapped song plays alone
  release(): void                  // finger lifted: whatever is loudest keeps playing alone, the other eases out
  stop(): void                     // leaving the screen
}
```

It decides which of the two players holds which song. Moving from branch a–b onto b–c must not restart b. Sliding
back toward a must bring a back, not silence. Start points: a song that comes in starts at its link's start point,
which may need a small, backward-compatible addition to `playback-crossfade.ts` (for example a start offset on
`peekLoad`). Home's left-drag crossfade is the user's favorite feature: every existing test in
`lib/playback-crossfade.test.ts` and `lib/crossfade.test.ts` must still pass unchanged.

### Lane 3, screen: `app/coral.tsx`, `components/coral/*`

- `components/coral/coral-canvas.tsx` is the only file importing Skia, loaded through `lazySkia`
  (`components/print/lazy-skia.tsx`). It draws a `GardenLayout`: water, floor, branches in a blend of their two
  songs' colors (Fade smooth, Cut with a visible notch at the middle), a polyp at each song, a glow where the finger
  is, and a slow sway. Reduce Motion turns the sway off.
- `app/coral.tsx`: the view. Pan along the coral calls `traceStep` then `mixFor` then `coralMix.touch`. Tapping a
  song plays it alone. A light haptic at the middle of a branch and when the finger crosses onto a new branch.
- Empty state: one line of plain English and a **Grow a branch** button. No gesture hints that never go away.
- Grow a branch: pick two songs from the Library's saved songs, then Fade or Cut. Say why in plain words when a
  pair can't be linked.
- Tapping a branch away from a drag opens a small sheet: Fade or Cut, where each song comes in, Remove.
- Mouse-first and visible buttons: everything works without knowing a gesture exists except the drag itself.
- Accessibility: each branch is one element with `accessibilityRole="adjustable"` and increment/decrement actions
  that move a quarter of the branch, so VoiceOver and TalkBack can mix. Text survives the largest text size.
- A route param `?example=1` fills the view with six made-up links from bundled data so it can be seen with an
  empty Library. Example links are never saved.

Until lanes 1 and 2 land, lane 3 codes against the signatures above.

### After the lanes: entry points (done at integration)

A Coral button in the Ocean's UI, and **Grow a branch from this song** on the creature sheet.

## Not in this version

Recording a traced path and replaying it as one piece. Looping. Beat matching. A third audible song. The dove.
