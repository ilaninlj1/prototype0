# Bottles: design

Date: 2026-10-28. Branch `bottles` (spec only so far), cut from `sdk-58` (0d9b833). Build on top of the finished Minimal UI (`minimal-ui-2`), because Bottles touches Home, the Library, Tune and Finds News, which that branch is redoing.

## Why

In October 2026 the music news is about AI flooding streaming. Deezer says it receives close to 90,000 fully AI-made tracks a day and is adding a switch to hide them. YouTube Music just added AI labels. Spotify says it took 50M+ "slop and spam" tracks out of recommendations. In Deezer and Ipsos's blind test (Nov 2025, 9,000 people), 97% couldn't pick out the AI song. Meanwhile UMG's lawsuit against DistroKid is triggering takedowns that hit real indie artists, Suno (an AI company) owns the concert finder Songkick, and small venues keep closing.

Every platform is answering with labels and filters, which means inspecting the file. Blindspot is the app built on listening blind, and the 97% figure says the ear can't tell anymore. So the proof that a song is worth hearing can't be in the sound. It has to come from people. **A song you can trust is one a stranger kept without knowing anything about it.**

Bottles makes that literal. Every blind find you save floats off to a stranger. It washes up on their Home as an ordinary blind card. If they keep it, it floats on. Each song gathers a chain of real people who chose it blind, and you get to watch where your finds go.

The student's own framing: "if you swipe right, we give that card to someone else since it's probably good". They called it beautiful "because it's connected and has to do with what's happening in music right now".

## What the research says, and what it decides

- **Social proof makes markets unequal and random.** In Salganik, Dodds & Watts's MusicLab (Science 2006, 14,341 people), showing earlier listeners' choices made the hits bigger and success less predictable. The best songs rarely flopped, but anything else could happen. → A bottle looks exactly like any other blind card. Its counts ("kept by 6 people") show only **after** you decide. Each save also launches one bottle that moves along one path, not copies that multiply, so popular songs can't snowball.
- **Free text kills drift bottles.** WeChat's Drift Bottle was pulled in 2018–19 after it filled with porn and solicitation. → Bottles carry a song and a city, and nothing typed. There's nothing to moderate.
- **Prior art.** Song Bottle (2026, mostly used in Japan) swaps one song for one song with a stranger and allows notes. Bottled relays text messages, and the receiver can keep one or let it drift on. → What's new here: the song arrives blind; it's a relay chain, not a swap; it costs no extra effort, because saving is the trigger; and the chain itself is the proof that people chose it.
- **Bridging** (Ovadya & Thorburn 2023; the Community Notes algorithm, Wojcik et al. 2022) ranks what's approved by people who usually disagree. → Phase 3's Tide chart counts the keepers for whom the song was "far from home". Blindspot already measures that (`lib/taste-distance.ts`).

## Goals

1. Saving a blind find sends it to a stranger, with no extra step.
2. Bottles from strangers show up in the normal blind feed, and you can't tell them apart until the reveal.
3. After you decide, you see the chain: how many people kept it and where.
4. You hear what happened to your finds ("Your find washed up in Seoul and was kept").
5. It feels alive with 10–20 testers, not only with thousands.
6. It's ready to show real journeys by the Dec 3 showcase.

## Non-goals

- No messages, names, profiles, follows or replies.
- No new native modules. `expo-location` is already in the app (Run mode), and Skia handles the globe.
- No change to how the normal feed picks songs.
- No Spotify or Apple data. Bottles only ever carry songs found blind in Blindspot.

## Anti-goals: a failure even if it technically works

- Bottles crowd the feed, or make it feel like a social app.
- Knowing a card is a bottle changes how people judge it (herding).
- A stranger can make your phone play something that isn't a real catalog song.
- Someone can work out where a specific person lives.
- A tester's sea looks empty for days.
- Undo, the action lock, crossfade, reveal or the loading states break.

## The life of a bottle

1. **Launch.** You save a song (double-tap, or Save after the reveal). If it was an organic blind find, a bottle floats: it came from the genre feed, Shuffle, Sort by sound, the Dark Map or Run, you listened for at least 10 s (`RATED_LISTEN_THRESHOLD_MS`), and it wasn't a bottle or a Daily Drop song. The bottle carries the song's iTunes track id, the Blindspot genre you were in, and your city.
2. **Floating.** The bottle waits on the server until a stranger's Home asks for one.
3. **Washing up.** When Home refills, it asks for one bottle, at most 1 card in 5. The server lends it to that one phone for 2 hours. The card is blind like every other card.
4. **The verdict,** decided when the card leaves the top of the stack:
   - **Kept**: they saved it. Their city joins the chain and the bottle floats on.
   - **Passed**: any other way the card left (skip, Next after a reveal, swipe down for a new genre). After **5 passes in a row** it sinks.
   - **Not for them**: their phone filtered it out without playing it, because they'd already heard the song, the artist is already in their Spotify, or it's AI-tagged and they hide AI. Nothing counts and it floats straight on.
   - **Unplayable**: no preview in their store. Nothing counts. The bottle retires after 3 different phones report it.
5. **The chain** never visits the same person twice. With a small community, a good bottle ends up waiting for someone new, and that's fine: "Still drifting · waiting for someone new".

## The rules

- **Mixing:** at most one bottle in every 5 cards. None in a new user's first 5 songs. None while you're steering with More like this, in the dark on the Dark Map, playing the Daily Drop, on a run, or when Tune → Test network is set to Offline. The genre feed and Shuffle get them. Sort by sound gets them only when the bottle matches the switches. *(Claude's call: steering is you asking for something specific.)*
- **Which bottle washes up:** the server prefers your current genre, then any genre. Within that, every other claim goes to the most recently moved bottle, so the current feels fast ("my friend got it two minutes later"). The rest go to the bottle that has waited longest, so nothing starves. *(Claude's call.)*
- **One path per bottle:** a bottle is lent to one phone at a time. If a bottle you received gets kept, your save carries that bottle forward and doesn't start a new one. Two people who find the same song on their own make two bottles, two separate lines.
- **Undo:** a bottle's verdict waits in an outbox until the next card leaves or the app goes to the background. Undo removes the pending verdict, along with the save, as it does today.
- **Offline:** verdicts and launches queue on the phone and send later. A late verdict counts only if no one else has borrowed the bottle since. Otherwise it's dropped, and the song stays in the person's own Library.
- **Caps:** 20 launches per person per day. Old finds can be floated once at opt-in (see Cold start). *(Claude's call.)*

## What you see

- **Saving:** the heart lands as it does today. The toast reads "Saved to Liked Songs · floating to someone". For the first 3 launches, a small light also lifts off the card toward the top edge (600 ms, a soft haptic). After that it's only the toast. *(Claude's call; the user's memory notes ask for tactile feedback.)*
- **A bottle's reveal:** the title, artist and release line as usual, plus one quiet line: "Washed up from Lisbon". There are no counts before you decide.
- **Keeping a bottle:** the counts arrive as a reward. "You're the 7th to keep this. It's floating on." Under it, a short route strip shows the cities as dots (Dallas · Austin · Lisbon · you), with the newest glowing. There's a light haptic.
- **Passing a bottle:** nothing. No guilt.
- **Finds News** gets bottle items: "Your find *Song* washed up in Seoul and was kept: 4 people, 3 cities." Also: "*Song* sank after 9 people kept it." They join the existing "While you were gone: N updates" line, so the status line doesn't change.
- **Library:** a saved song that has a bottle shows a small wave mark. Tapping it opens its journey sheet: the route, each hop with its city and day, and whether it's still floating, waiting or sunk.
- **Tune → Bottles:** one switch for both sending and receiving, so it's fair both ways and simple.

## Where you are

- **First time:** the first save that would float shows a one-time card. "Your saves float to strangers, blind. Only your city goes with them." Two buttons: [Use my city] and [Not now]. "Use my city" asks for location at reduced accuracy, reverse-geocodes it to a city and country on the phone, and rounds the coordinates to 0.5° (about 55 km) before anything is sent. "Not now" still floats the bottle, and the hop shows a region from the phone's time zone ("Somewhere in Central US"). Never the time zone's city, because Dallas phones say America/Chicago.
- The city is refreshed at most once a day, and only when the app is open.
- No street, neighborhood or exact point ever leaves the phone.

## Safety: everything from the server is untrusted input

- A bottle row carries only a track id, a genre tag, an artist key, cities, rounded coordinates and times. **The phone never plays a URL from the server.** It looks the track id up in the bundled catalog (every catalog entry has `itunesTrackId`) or through a paced iTunes lookup in its own store. It takes the preview and artwork only from there. Anything that doesn't resolve is reported Unplayable.
- Every returned row is validated (types, lengths, ranges). Bad rows are dropped and logged, and they never crash Home. This is real P8 material, "external interfaces and unreliable input".
- AI: claims skip artists that 3+ phones reported (`ai_reported`). Phones also apply their own AI filter and "already in your Spotify" rule.
- The Tide chart (phase 3) counts keeps only from accounts at least 3 days old, so making new accounts can't pump a song.

## Server (Supabase, same pattern as Twins)

Anonymous-auth user per install (`lib/auth.ts ensureSession`). Tables have RLS on and no direct grants. Everything goes through `security definer` functions:

- `bottles`: id, track_id, artist_key, genre_tag, launched_by, launched_at, state (floating / sunk / retired), keeps, passes, passes_in_row, unplayable, holder, lease_until, last_moved_at, last city / lat / lng.
- `bottle_hops`: bottle_id, user_id, kind (launch / keep), city, country, lat, lng, tier (close / new / deep / null), at. This is the visible chain.
- `bottle_offers`: bottle_id, user_id, offered_at, verdict, decided_at, with primary key (bottle_id, user_id). It stops repeats and holds the verdict log.
- `float_bottle(track_id, artist_key, genre_tag, place)`: enforces the daily cap and one bottle per person per song.
- `claim_bottle(genre_tag)`: returns at most one bottle with its whole chain (cities, keeps), and sets the holder and a 2-hour lease. The phone keeps the chain hidden and shows it only after the verdict. So the keep moment needs no round trip, and it works with Undo and offline.
- `decide_bottle(id, verdict, place, tier)`: records the verdict and returns the updated summary. It's used when the outbox flushes, not for the moment itself.
- `my_bottles(since)`: the bottles you launched or kept that have changed since your last check, with their hops. It feeds Finds News, the Library and the Sea.
- A journey is only readable by people who are part of it.

The SQL ships as `supabase/bottles.sql`. The student runs it in the Supabase dashboard, as with earlier tables.

## Cold start

- **Float your old finds:** when you turn Bottles on, a one-time offer: "Your N blind finds can float too · Float them". It covers past saves that came from the feed with 10 s+ listens, up to 30. That fills the sea on day one from the testers' existing saves. *(Claude's call.)*
- **Get real distance before Dec 3:** the testers are mostly in Dallas, so most journeys will be one dot. Same-city hops draw as a small ring of lights ("4 people in Dallas kept it"), never as a fake spread. The real fix is people: the student should send the build to friends and family in other cities this week, so the showcase has real lines.
- No invented bottles or chains, ever. A dev-only simulator (several fake phones in one test) exists for building and testing, never in a tester build.

## Phases

1. **Bottles float and wash up:** the server, launch, claim, verdicts, outbox and undo, the reveal line, the keep moment with its route strip, the consent card, the Tune switch, Finds News items, the Library wave mark and journey sheet, and floating old finds. That's enough for testers.
2. **The Sea:** a full-screen dark experience, alongside the Dark Map, Rewind and the Edition. It's a dotted globe (Natural Earth 110m land, public domain, baked into a small file of land dots) that turns slowly and spins on drag. Each of your bottles is an arc of light, and pulses travel along it in the order of its hops. Tap an arc for the song, its preview and its hops. You open it from the journey sheet and from You.
3. **The Tide:** a chart of songs strangers kept blind, ranked by keeps per hearing. It also lists **bridges**: songs kept by people for whom they were "far from home" ("New ground" or "Deep in your blind spot"). Build it once there's enough data.

## Checks for every phase

- `npx tsc --noEmit` is clean. All tests pass: `node --experimental-strip-types --test $(git ls-files '*.test.ts')`.
- Pure, tested modules for the mixing rule, the verdict from an action, outbox and undo, launch eligibility, the journey text, news from `my_bottles` changes, coordinate rounding and the time-zone region fallback, and row validation.
- A simulated sea in tests: 12 fake phones swipe at different rates. Check that no phone sees a bottle twice, chains never repeat a person, nothing starves, sinking happens after 5 passes, and an undo in the middle of a verdict leaves the server state right.
- A web check at 390pt, with location falling back to the region on web. Then an Expo Go update group plus QR, and a two-phone test: save on phone A, and it washes up on phone B.

## What to measure, for the paper

- **Keep rate of bottles vs. save rate of normal cards.** Bottles are blind and look like any other card, so this is a clean test of whether one stranger's blind save predicts another's.
- Keep rate by hop number, chain lengths, time to the first keep, and how many bottles sink vs. keep floating.
- Do people who get "your bottle was kept" news come back more? The student's stated goal is people coming back.
- Report what really happened, including a small, mostly Dallas sample.

## Calls Claude made (for the student to check)

- The trigger is the save, not the right swipe, because right means "More like this" and doesn't save.
- At most 1 bottle in 5 cards, none in the first 5 songs, none while steering, in the dark, in the Drop, on a run or offline.
- Counts show only after you decide; the reveal shows only "Washed up from <city>".
- A bottle sinks after 5 passes in a row; it retires after 3 Unplayable reports.
- One switch covers both sending and receiving.
- Fresh and longest-waiting bottles alternate.
- 20 launches a day; old finds float once at opt-in, up to 30.
- Cities come from location at reduced accuracy, rounded to 0.5°, with a time-zone region as the fallback.
- The working name is "Bottles", and the globe is "The Sea".

## Notes for the builder

- A bottle's track id is the iTunes track id, which is what `DiscoveryTrack.id` already is for pool songs (`trackToDiscoveryTrack`), and `primaryGenreName` is the Blindspot genre tag there. Resolve bottles through an id → catalog entry index built once from `allCatalogs()`.
- Bottle cards carry `via: 'bottle'` plus the bottle id and the hidden chain. Their swipes log `source: 'bottle'`, so the paper's keep rate can be measured from swipe history.
- The launch hook is `handleSave` in `app/(tabs)/index.tsx`, which is the one save path. The verdict is decided wherever a card leaves the top.
- On the web, `expo-location` can't reverse-geocode, so the web check uses the time-zone region.
- The app is on Expo SDK 58. Read the SDK 58 docs for `expo-location` before using it (AGENTS.md still says v57).
- With the Bottles switch off, Home never claims and saves never launch. The outbox still flushes what it already holds.

## Left to the builder

The exact animation curves, icons and haptics; the storage keys; the component structure; the lease and outbox timings within the rules above; the time-zone-to-region table; the land-dot density for the Sea; and how the work is split between Claude, Codex and Gemini.
