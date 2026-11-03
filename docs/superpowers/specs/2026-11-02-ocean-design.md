# The Ocean

> **Revised 2026-11-03 after the user's first look on a phone.** Their decisions, which override anything below that disagrees: sand only at the bottom of Buried; no wild creatures, so an empty ocean is empty and See an example shows a grown one; creatures must not look alike or just swim; biomes must move smoothly. What that became: a reef wall runs down one side of each water, and coral grows on it; skips settle on the sea floor; every song gets its own body from its sound (`lib/ocean-anatomy.ts`) and eight kinds of creature instead of five (manta, eel and seahorse added); creatures wander and turn, do their own move now and then, dance when the playing song matches their tempo, glow when it matches their key, and swim with songs that sound alike; your newest find comes to greet you; biomes dissolve into each other with parallax, over one unbroken sea floor. Tapping a wild fish to filter went away with the wild fish.

Home's blank white gets a living ocean underneath it. Swipe up from the water to go under. The ocean is a portrait of the person listening: everything in it comes from what they actually did. Where you swim decides what you swipe next.

Playable references, for feel and not for code (each is one web canvas with made-up songs):
- `docs/superpowers/specs/2026-11-02-ocean-mock.html`: the dive, the waters, the creatures, the depths.
- `docs/superpowers/specs/2026-11-02-ocean-mock-personal.html`: day one against two different people, by day and night, with a creature explaining itself when tapped.

## Biomes, depth and the graph (2026-11-03, the user's second look)

The user: no wall or floor on the side; each biome gets life meant just for it, the way kelp is; different sliding parts at different depths; and a graph of where each fish has moved. They picked both graph lines and said start building. The specifics below are Claude's calls unless marked.

**Biomes.** Nothing structural is shared. Sand only at the bottom of Buried (the user's).
- Sunny reef: coral towers rising from the floor toward the light, with anemones. Songs you heard become coral on the towers. Clownfish nest in the anemones.
- Kelp forest: kelp from floor to surface. Songs you heard become new stems in their color, so the forest thickens as you listen. Creatures weave between stems and pass behind the near ones.
- Open blue: nothing solid, on purpose. Currents flow across as long ribbons; seaweed rafts drift. Songs you heard become rafts. Creatures ride the current together.
- Midnight: glowing tendrils hang from above; vents smoke and whale bones lie on the floor. Songs you heard become glowing lanterns on tendrils, or tube worms on the floor. Creatures flash to find each other.

**Depth while sliding.** Layers move at their own speed: faint far shapes slowest, then structures, then creatures, then blurry-looking things close by, fastest. And the floor runs like a real coast: the reef's is highest and Midnight's is a trench.

**Fish that climb (graph line one).** Depth means how many people know a song, so across is sound and down is popularity. Every fourfold rise in the artist's listeners since you saved the song is one level up, so a fish can leave the level you found it in. It leaves a faint trail back to where you found it, and tapping it says "Found in Buried at 12K. Now 90K." Last.fm's count is per artist, so one artist's songs climb together. Songs with no listener count at save time don't climb. Most small artists barely move for months: expected, and it makes a climb a real moment.

**Your path (graph line two).** A glowing line through the ocean of where you listened over time, from the swipe log, so it has data from day one.

**The whole chart.** Pinching out, or a button, shows the entire ocean as one graph: every fish, every trail, your path, the waters and depths labeled. Tapping a fish explains it and tapping a place goes there. See an example shows a full one.

**Dropped:** the reef wall, `restSpot` against it.

## Why

The user finds Home's white empty and wants the app complete enough to show on a resume. They asked for an ocean under the water with fish, coral, sand, bubbles and sun glimmering, with swimming somewhere acting as a song filter. They liked all three first mocks and asked to make it "feel like an ecosystem". Then they said it's "supposed to present you, authenticity" and asked how to make each one personal, using logic.

The answer this design commits to: **the song decides what it is, and you decide what it becomes.** The map and species are the same for everyone. Everything else comes from behavior nobody chose to display, and blind listening is what makes that behavior honest: you judged the song without knowing whose it was.

## Goals

- Home's card, words and buttons stay exactly where they are. The white stays white. The water is the only new thing on Home. (Changed 2026-11-03: the user asked for a sky on Home. See `2026-11-03-home-sky-design.md`.)
- Swiping up from the water takes you under, and the water follows the finger the whole way.
- Two people's oceans look different, and the same song looks different in each.
- Every visible trait of a song's creature has one cause, and the app can say it in a sentence.
- Swimming to a place and tapping **Swipe these songs** filters the feed to that place.
- The first dive is beautiful and full of life, even with zero saves.

## Non-goals (for this build)

- Sharing the ocean, or showing it to other people. It's built as a mirror first (Claude's call: the user was asked and didn't choose). A share picture and People visitors come later.
- The resume polish pass (demo video, README, overall polish, thinning out the You tab's many portraits). It's a separate step after this.
- Backup. History and Library live only on the phone today, so a new phone starts a new ocean. Worth doing before calling this finished for real users, but not part of this build.
- Feeding, currency, unlocks or decorating. These would break the authenticity rule.
- Muffled underwater audio. Not attempted.
- Changing how the Dark Map, Tune or the "What to swipe" page work.

## Anti-goals (a failure even if it works)

- Guilt. Nothing dies, shrinks or gets dirty when you leave.
- Anything you can buy, pick or fake. Authenticity is the point.
- Random looks. Motion can be random. Looks can't: the same history always gives the same ocean.
- Clip art. It has to look at least as good as the mock, and sleek.
- Home feeling slower or busier while you're just listening.
- Accidental dives while swiping the card, or a filter reachable only through a hidden gesture.
- Spoiling a blind card.

## The map (the same for everyone)

Four waters across, four depths down: 16 places. Swipe sideways to change water, up to sink, down to rise. Buttons do all of this too.

### Waters (from a song's sound; first match wins)

| Water | Rule | Caption | Share of measured songs |
|---|---|---|---|
| Open blue | `instrumentalness > 0.5` | Mostly instrumental | 21% |
| Kelp forest | `acousticness > 0.6` | Acoustic | 12% |
| Midnight | `valence < 0.3`, or `valence < 0.45` and `energy < 0.45` | Dark and moody | 14% |
| Sunny reef | everything else | Upbeat, with a full sound | 53% |

The order across the screen is Sunny reef, Kelp forest, Open blue, Midnight.

### Depths (the app's existing popularity bands)

| Level | Preset | Artist band and song band | Look |
|---|---|---|---|
| 1 | C Popular | popular, hit | Full sun, rays, glints |
| 2 | B Deep cuts | popular, deepcut | Rays thinning |
| 3 | A Hidden gems | obscure, hit | Twilight, first glowing specks |
| 4 | D Buried | obscure, deepcut | Dark, the sea floor |

One classifier everywhere, for filtering and for where a saved song lives: the artist's catalog band, and `rank <= hitRankMax` for the song, exactly as `catalogTrack` in `lib/pool.ts` decides. So a song found at a depth lives at that depth. Songs only in a catalog's `mixed` list count as deepcut, as they do there. Do not use a fixed listener cutoff or the You tab's iceberg tiers: bands are relative to each genre, and the catalog has no artist under 10K listeners. Songs outside the catalog: small artist if `artistListeners <= 100_000`, top song if `trackRank <= hitRankMax`; unknown goes to Popular.

Measured on today's catalog: every one of the 16 places has at least 66 artists, counting only songs in a hits or deep cuts list. The smallest is Kelp forest / Popular, the largest Sunny reef / Buried at 454.

### Species (from a song's sound; first match wins)

| Creature | Rule | Means | Share |
|---|---|---|---|
| Jellyfish | `energy < 0.4` | Quiet | 14% |
| Turtle | `tempo < 95` | Slow | 14% |
| Puffer | `energy >= 0.88` | Loud | 16% |
| Darting fish | `tempo >= 125` | Fast | 29% |
| Clownfish | everything else | In between | 27% |

The app's "Loud and dense" rule isn't used: it would make 41% of the ocean puffers. A song with no sound data (about 1 in 4) is a plain silver drifter, placed in a water by a hash of its track id. It becomes its proper species once a live lookup measures it.

## What you make it (personal to each person)

Everything here is a pure function of the swipe history, the Library, the sound data and the clock. Nothing new is stored except last place and first-time flags. That keeps it testable and makes Undo, delete and restore correct automatically. Existing users arrive with a grown ocean on update, with no migration.

| What you did | Data | What it changes |
|---|---|---|
| Chose a song blind and saved it | `foundBlind` stamped on the save, or a non-run `like` or `reveal` entry for it, or a save older than the swipe log | It hatches as a creature in its home place. Other saves (looked up on the song page, say) stay in the Library with no creature |
| How much you listened | the song's longest `listenMs`, raised when the card leaves so listening on after an early save counts; full at 24 s as in `lib/dark-map.ts`; missing counts as middling | Vivid and full, or small and faint. Saving 100 songs in a hurry gets you 100 tiny fish |
| How long you've kept it | `likedAt` | It grows, on a curve that flattens out at about a year. Your oldest find is always the largest |
| The hour you found it | `likedAt` in local time | Awake for the 12 hours centered on that hour. Asleep otherwise. No date means always awake |
| How far it was from your usual taste then | `tasteDistance` against only the saves made before it; `deep` tier; needs 5 earlier saves | A rare, shimmering form. A folk song is rare in a metal fan's ocean and ordinary in a folk fan's |
| Revealed it but didn't keep it | a `reveal` entry, not in the Library | A piece of coral in that song's color in its place |
| Skipped it | `skip` or `genre-jump`, heard at least 2 s, not `source: 'run'` | Sand: the dune rises a little, and one colored speck joins it, up to a cap per place |

Color rule: **only your listening adds color.** Each song's color is its print color (`songLight`, so warm for major, blue for minor, never violet). Sun, water and plain sand are always beautiful. The baseline reef, weed and wild creatures are pale and stay pale, and your coral grows over them. So a place you've heard nothing from is entirely pale, its pill says "You haven't been here yet", and that is how blind spots show. Sunny reef / Popular looks as good pale as the mock's Day one.

**Every creature explains itself.** Tapping one shows a light sheet: cover, title, artist, your note, play or pause, "Swipe songs like this", and plain sentences from the table above, such as "Big because you've had it 8 months. Out at night because you found it at 2:14am." Wild creatures say they aren't your songs.

**Blind stays blind.** Double-tap saves while the card stays blind, so a song's creature can hatch while its card is still up. Until that card is revealed or gone, its creature's sheet shows no title, artist or cover, and the screen reader gets the same: "Still blind. Reveal it on Home first."

**A written portrait.** Plain lines from the same data, in a "Your ocean" sheet opened from a button under the water and a card on You → Discoveries: "Mostly comes out at night. Most of your songs live in Midnight. You've never been to the Kelp forest. Your oldest find is 14 months old." Two people should never read the same thing.

**See an example.** On a thin ocean, a button dives into a bundled made-up history through the same code, clearly labeled, with no effect on your data. This is how someone looking at it for a resume sees a grown ocean. People has the same pattern.

## How it behaves

### On Home

- The surface stays where the sea line is today, using `lib/sea-beat.ts`'s surface exactly, so the swell, tsunami, tide, stranger's bottle and launch light keep working. Below it, the line becomes real water, filled unbroken to the phone's bottom edge, behind the tab bar.
- White crest, sun glints, bubbles, faint mist on the white just above the water. A wild fish or a new creature passes through.
- Layout fact: the surface sits only 13 pt above the tab bar, and the action row sits right above the surface, so while the tab bar shows, its icons are on the water. They must stay readable there, and a drag starting on the tab bar must still dive while a tap still switches tabs. On Home the bar's background goes clear; other tabs don't change. `SeaLine` says "It never takes a touch" today; that changes.
- A short white grabber always rides the crest, tappable with a generous hit area: the visible way in. A tap anywhere else on the water wakes the buttons, like any empty space on Home.
- First-time text comes at the moment it means something, after the first save: "Your song went under. Swipe up to see it." For the first 5 songs the buttons and tab bar stay pinned, so it must fit around them.
- The water's color is Sunny reef's shallows, or the chosen place's while an ocean filter is on.

### Going under

- The water rises with the finger and Home slides up with it. Past about a fifth of the way it finishes; otherwise it falls back. One light haptic as it breaks the surface.
- It's an overlay inside Home, not a route. Home has to stay focused so the song keeps playing (`usePreviewWhileFocused`), and the rise must be continuous.
- The tab bar is hidden while under. Android back returns to the surface. The drawing stops when Home isn't focused or the app is in the background.
- You arrive at the place you last visited, or the active filter's place, or Sunny reef / Popular the first time.

### Under the water

- Always visible: a white pill with the place's name and caption plus songs left there ("Midnight · Buried / Dark and moody · 142 songs left"), side arrows for waters, tappable depth labels, a black **Swipe these songs** button, a **Back up** button, and the "Your ocean" button.
- Nothing about the current blind card is shown down here.
- First-time hint, one short line: "Tap a fish to pick its kind of song."
- Dragging down at Popular rises to the surface. Dragging down anywhere else rises one level. **Back up** goes straight to the surface.
- Each place is drawn from its water's flora and its depth's light. Every stop has seabed along the bottom, as stepped terraces with a drop-off beside them, so you sink past one ledge to the next. The first mock's big side wall is not the look to copy. Buried is dark sand.

### Filtering

- **Swipe these songs** rises to the surface, shows "Swiping: Midnight · Buried ✕" on Home's status line, and serves only that place. Reuse Home's deck path: `startDeck`, `leaveDeck`, the ✕, no bottles while in a deck, falling back to the genre when dry. Add a `Deck` kind to `lib/decks.ts` holding water, depth and optional species. `DeckCandidate` needs the depth, and `runCandidates` can pass it through. Tune's preset isn't changed.
- `steerToNeighbors` runs on every reveal and can insert songs from outside a deck. While an ocean filter is on, its next 3 songs must stay inside the place, or the filter isn't real. Existing sound decks leak the same way, so fix them with it if it's the same change.
- Tapping a wild creature of one of the five species narrows the filter to that species: it shows a tag, and the pill says "Fast songs in Midnight · Buried". Tapping it again or tapping open water clears it. 7 of the 80 place-and-species mixes have under 10 artists (mostly loud songs in Kelp forest). When fewer than 3 unheard artists are left, drop the species, say so plainly on the status line, and keep the place.
- Time under doesn't count toward `dwellMs`: pause `cardShownAtRef`'s clock. Listening time stays true.
- Log swipes `source: 'ocean'` and saves `via: 'ocean'`, like the Dark Map, so the class paper can compare them.

### Hatching

On a save from Home, a light falls into the water (`LaunchLight` does this today only for songs that float as bottles; extend it to every save). The creature pops out at the surface, stays in Home's water a few seconds, then swims down to its home.

Undo on Home doesn't remove saves today, and this design doesn't change that, so Undo leaves the creature (`foundBlind` keeps it eligible after the entry is rewound). Undo does restore the history, so coral and sand follow it. Deleting a save from the Library takes the creature away, and the song falls back to coral if it has a `reveal` entry. Restoring brings it back.

### What makes it alive

- **Wild life from day one**: each place has its own pale wild creatures, and they thin out as your songs move in. The five species, plus creatures that only react and don't filter: whale in Open blue, angler at the bottom, crabs and starfish on sand. At most 40 creatures animate in a place, and your newest songs win over wild ones. If more of yours live there, an "All 63 here" button lists them.
- **Asleep isn't gone**: sleepers rest spread along the seabed and tucked into coral, still tappable, not in a pile. If under a third of a place's creatures are awake, wild ones fill the water so it never feels dead at the wrong hour.
- **Relationships**: 2 or more saves by one artist swim as a school. Small fish scatter from a big one passing and from your finger.
- **The beat**: the current song keeps playing, and coral, weed, fish and bubbles follow it through `seaRhythm` and the player clock.
- **The ocean plays your songs (Claude's addition)**: previews last 30 s and nothing auto-advances on Home, so the music would otherwise stop half a minute after you dive. When the card's clip ends under water, your songs from this place play one after another, and that creature lights up and comes forward. With none there, it's quiet and the sea stays calm. None of this counts toward the card's listening or the song's data. Rising to the surface brings the card back.
- **Time of day**: dawn, day, dusk and night from the phone's clock change the water and the sun, with moonlight and glowing creatures at night. Home's white stays white at every hour.
- **Bottles**: bottles you launched or kept (`useMyBottles`) rest on the sand in their song's place and open the existing journey sheet. None if Bottles is off.
- **Links both ways**: Details on a revealed song says "Lives in Midnight · Buried" and tapping dives there. A Library song with a creature can open it. Each uses the existing steer-request pattern.

## Constraints

- Built on branch `ocean`, on top of `people` (neither merged nor pushed). SDK 58 in this worktree: read the v58 Expo docs, even though `AGENTS.md` still says v57.
- No new native modules, so it reaches the 1.0.5 APK through an update. Skia, Reanimated, Gesture Handler and Haptics are already in.
- All art is drawn in code, no image assets, so the app stays IP-original. App rules hold: no violet (`isBannedHue`, so the mock's purple tube coral changes), no emoji, Figtree text, white pill and black button as elsewhere.
- Skia only in lazily loaded `*-canvas.tsx` files through `lazySkia`.
- New rules go in pure, tested files: where a song lives, what a person's ocean contains, and creature movement (worklet-safe, like `lib/sea-beat.ts`). Required tests: the same history always gives the same ocean; the same song gives different creatures for two made-up people; saving in a hurry can't produce a big or vivid creature; a looked-up save never hatches; Undo and delete stay consistent; a blind card's creature never gives up its name.
- Every blind way of saving stamps `foundBlind`: Home, Daily Drop, People, the Blind Spot Test, Blind Pack, DJ Picks, and Run only for songs it played blind. Saves older than the swipe log count as blind.
- Building a person's ocean must not stall the dive. Time it on a made-up history of 5,000 swipes and 500 saves. `deckPool` builds from about 10,000 songs on first use, so warm it after Home loads, not on the first drag.
- Don't optimize on a guess. Measure frame rate on a real phone, while listening on Home and under the water, and fix only what the numbers show.
- No reduced-motion or screen reader dead ends. Reduced motion: still scene, fades instead of following the finger. Screen reader: a list of waters, depths and saved songs with the same actions, like the Dark Map's LIST.
- iOS's home-indicator swipe owns the very bottom of the screen. Checking on a phone that diving works without fighting it, the tab bar and the card is part of done, at 360, 375 and 390 pt widths and on a phone with a home button.
- "The Sea" already names the bottles' globe. In the UI, this is "your ocean", and the journey sheet's "See it on the Sea" stays.

## Calls made by Claude, not the user

Open to change: all rules and thresholds above, the 16-place grid and depth order, drifters, terraces, the 40-creature cap, the 12-hour awake window, what gets logged, the grabber, no auto-advance on the feed, the ocean playing your songs, the "Still blind" sheet, and mirror-first with sharing later.

The user approved these by saying "i love this" and "beautiful" to proposals that recommended them, without choosing them directly: the ocean starts full of life, and that life starts pale.

## Left to the builder

The drawing technique, how the water runs behind the tab bar, how to split the Skia canvases and keep Home's strip light, the movement model's details, exact curves, brightness and color values, caps on coral and sand, and species per place.

## Suggested order

1. **The ocean you can dive into**: Home's water, the dive, 16 places with pale wild life, filtering. Put it on a phone.
2. **It's made of you**: the pure ocean-of-a-person logic, creatures, hatching, coral, sand, explanations, the list, the blind rule.
3. **It's alive**: awake and asleep, schools and scattering, the beat, your songs playing, time of day, bottles, the written portrait, See an example, links both ways.
