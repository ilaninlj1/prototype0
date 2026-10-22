# Run mode — design

Date: 2026-10-22. Branch `run-mode`, cut from `minimal-ui` (631922a), so it already has the light app, the four tabs and the Library. Worktree `~/Desktop/prototype0-run`. This is Prototype 7, due Friday 2026-10-23: a device-specific capability tested on a physical phone. Run mode uses the motion sensor, GPS, keep-awake, haptics and lock screen audio.

## Why

Songs hit harder when you're moving, so a run is a better moment to find music than sitting at a desk. Blindspot on a run isn't a gimmick. It may be the best place to use the app. Run mode also helps you hold the pace you want: song tempo pulls your step rate, and a song's energy changes how long your steps are, so together they set your speed.

It's for everyone who moves with music. That includes people who have never run, regular runners and walkers. The student doesn't run yet and plans to start.

## Research it rests on (cite in the Part 2 paper)

- **Tempo moves step rate.** Van Dyck et al. 2015, *Sports Medicine – Open*, "Spontaneous Entrainment of Running Cadence to Music Tempo": tempo shifts of 1–3%, too small to notice, changed the cadence of 16 recreational runners.
- **Step rate alone doesn't change speed.** In a 12-week study (Maastricht, a randomized multiple baseline design, 7 runners), beats 7.5–10% above cadence raised cadence by 8.5%, but speed and heart rate stayed the same. People took shorter steps instead.
- **Energy changes step length.** Leman et al. 2013, *PLoS ONE*, "Activating and Relaxing Music Entrains the Speed of Beat Synchronized Walking": at a fixed 130 BPM, some songs made walkers take longer steps and walk faster, and others slowed them down. Loudness and pitch patterns explained about 60% of the difference.
- **Beginners run too hard.** Recreational runners given 80/20 plans still did most of their running too hard. Most runs should be easy, slow enough to talk in full sentences (Zone 2, 60–70% of max heart rate).
- **The talk test stands in for heart rate.** Persinger, Foster et al. 2004: the first point where talking gets hard matches the ventilatory threshold on a treadmill and a bike. Age formulas for max heart rate are off by 10–12 bpm anyway, and a phone can't read heart rate without a watch.
- **Typical runs.** Strava users average 3.7–3.9 miles, about 35 minutes, at 9–10 min/mile. Couch to 5K starts at 1 minute running and 1.5 minutes walking, then builds to 30 minutes nonstop over 9 weeks.
- **Phone GPS is shakier than a watch's,** so pace is averaged over about a minute.

## Decided by the student

- **The pace engine sits underneath; discovery is the pitch.** Pace-matching apps already exist (RockMyRun, Weav, Spotify Running, which shut down). Finding new music blind mid-run is the new part.
- **Goals are a feel, not a number:** Easy ("you could still chat"), Steady ("short phrases"), Push ("a few words"). Easy is the default. Anyone who knows their pace can type one in instead.
- **It learns you.** It starts by learning your natural step rate. A walker might sit around 110 steps a minute and a runner around 165. It plays songs at that tempo and leans on calmer or higher-energy songs to slow you down or push you. After the run it asks "Could you talk the whole time?", and the answer moves your next targets, so your Easy pace gets faster over the weeks.
- **Songs: Blind, Mix or Liked,** with Mix as the default. Mix is mostly your saves with a blind song every few tracks. It leans blind until you have enough saves that fit your pace.
- **Three controls: like, skip, back.** "Your legs liked it" catches songs automatically, and knocking twice on your pocket likes a song. Earbud or lock screen buttons skip and go back. Knock detection gets tested on a phone before anyone relies on it, and a tap-anywhere screen is the fallback.
- **The reveal:** one screen, scrolled. At the top is the pace line, with a bar under it for each song, and the hardest-hitting song (where you ran fastest) right below. Under that are two tabs: **Songs**, the tracklist marked "you liked" or "legs liked", and **Route**, the map with a pin wherever a song stuck. Approved on the mockups.
- *(Claude's call, shown on the mockup)* **Legs-liked songs aren't saved until you keep them.** A song that felt amazing at mile 2 might feel mid at your desk. "Keep all" saves them in one tap. Songs you liked yourself save right away.
- *(Claude's call, shown on the mockup)* **The route stays private.** Only you see the map, and a shared print never shows the route.

## Goals

1. You start a run in two taps, put the phone away, and the music fits your stride.
2. The songs pull you toward your goal: calmer when you're too fast, more energy when you're too slow.
3. Liking a song never needs the screen.
4. The reveal makes the run worth opening afterward.
5. It works in Expo Go on iPhone and Android, tested on a real phone.

## Non-goals

- No heart rate, no watch and no HealthKit/Google Fit. Those need native work outside Expo Go.
- No training plans and no Couch to 5K schedule this round. The talk test plus "build you up" is the whole coaching loop.
- No map tiles, street maps or maps API. The route is your own line on the dark ground.
- No changes to the Home feed, the queue or the swipe rules.

## Anti-goals: a failure even if it technically works

- A song changes because of a pocket touch.
- Run mode needs the screen to work mid-run.
- Footsteps fire knock likes. A false like is worse than a missed one.
- The app tells a beginner to speed up when they should slow down.
- The reveal is a wall of numbers with no music in it.
- Location ever leaves the phone, or shows up in something shared.

## How it works

### Where it lives
A **Run** card in the Play tab's lineup, second after Daily Drop, with its own emblem. Its stat is "runs" (count), its CTA "Start a run". The run screens are full-screen dark experiences like the Edition: they use `DarkColors`, and Run is added to the list of dark experiences.

Screens:
- `app/run.tsx`: the setup screen, then the live run on the same route.
- `app/run-reveal.tsx?id=`: the reveal.
- `app/runs.tsx`: past runs, reached from the Run card and from the reveal.

### Setup
How hard (Easy · Steady · Push, with a one-line meaning under each), songs (Blind · Mix · Liked) and a small "Type a pace instead" link. Then Start. The first time, it asks for location and motion permission with plain-English reasons. Below Start is a small "Try knock to like" link that opens a knock tester (see Knock).

### During the run
- **The screen stays on but black** (keep-awake, OLED black). Expo Go stops GPS and sensor updates when the app is in the background, so locking the phone would blind the app. The music keeps playing if the phone does get locked, and the app says so when you come back ("Your phone was locked for 4 minutes, so those minutes aren't in your run").
- **Shown, big and dim:** current pace, the goal state ("On pace · Easy", "A bit fast, easing off", "Picking it up"), elapsed time and distance, and a small "164 steps/min · song 164 BPM" line.
- **Touches are ignored** unless you **hold the screen for half a second.** That wakes the controls for 5 seconds: double-tap to like, swipe left to skip, swipe right to go back, plus End run. That protects against pocket touches.
- **Lock screen and earbuds:** the lock screen player shows the blind card's title ("Blind song #12"), never the real name, plus the jump-forward and jump-back buttons. A forward jump of 8 s or more counts as a skip and a backward jump as back. Single-press play/pause works as usual.
- **Haptics:** a success buzz when a like lands, so you feel it in your pocket.

### Step rate
From the accelerometer at about 50 Hz. Footsteps are the strongest rhythmic peaks in the acceleration size. Step rate is steps per minute over a rolling 10 s window. Under 135 spm you're walking; at 135 or more, running. The first 90 seconds are **calibration**: the app keeps your natural step rate, and songs start near that rate's tempo.

### Pace
From foreground GPS (`watchPositionAsync`, about 1 s updates). Fixes worse than 25 m accuracy are dropped, and so are jumps faster than a human can move. Pace is the distance over the last 60 seconds. It reads "—" until 30 s of good fixes exist.

### Which song is next
Every candidate is a catalog song with a measured tempo and energy (`assets/sound-index.json`, about 8,300 songs). A song **fits** when its tempo, at half, normal or double time, is within 4% of the target step rate. The window widens to 6% and then 8% when fewer than 12 fit.
- **Blind:** unheard songs only (not in swipe history, not liked, not a known Spotify artist), and one artist per run.
- **Liked:** your saves that have sound data, with a looser fit (8%, then any tempo).
- **Mix:** a Liked song, then a Liked song, then a Blind song, repeating. A Blind song plays whenever no Liked song fits.

**Steering** runs every 60 s, once the pace has a reading:
- **Too fast** (more than 5% faster than the goal pace): the next songs aim for low energy (≤0.55), and the target step rate drops 2%.
- **Too slow** (more than 5% slower): high energy (≥0.7), and the target step rate rises 2%.
- **On pace:** middle energy (0.45–0.8), with the target at your current step rate.
- The target step rate never moves more than 6% from your natural one, and each nudge stays under the 3–4% people notice.

### Goal pace
- **Typed pace** wins if there is one.
- **Otherwise it's learned per goal.** Easy pace is stored after each run with a talk-test answer. "Yes, the whole time": next Easy pace = that run's average pace, 2% faster (build up). "Mostly": the same pace. "No": 4% slower. Steady = Easy × 0.92 (8% faster), Push = Easy × 0.85.
- **First run, no history:** there's no number yet. The app takes your settled pace from minutes 2–4 as the goal and only ever eases you off if you speed up past it. That's the "beginners go out too fast" fix. With Steady or Push on a first run, it holds the settled pace.

### Your legs liked it
For each song, the window starts 5 s after it begins and runs to its end. Each song is compared with the 60 s before it:
- **Lift:** average speed in the window vs. before it (%).
- **Lock:** the share of the window where step rate sat within 2% of the song's beat.

A song gets **legs liked** if lift ≥ 4% while the app wasn't pushing for more energy, *or* lock ≥ 70% plus lift ≥ 2%. There's at most 1 legs-liked song per 5 songs played, and the highest scores win. **Hardest-hitting:** the song with the fastest average speed over at least 20 s of good GPS.

### Knock to like (beta)
A knock is a short, sharp spike in jerk, the change in acceleration between samples, about 1–2 samples wide. A footstrike is wider and repeats. A **double knock** is two spikes 120–450 ms apart, neither within 60 ms of a detected footstrike, with no third spike for 400 ms. The setup screen's "Try knock to like" opens a tester. It shows each detection with a buzz and counts false ones while you jog in place. Knock likes stay off until the tester has caught 3 double knocks in a row. That's per phone, saved on the device, and there's an Off switch.

### After the run
1. **The talk test sheet:** "Could you talk the whole time?" Yes · Mostly · No. One tap, skippable.
2. **The reveal**, as approved:
   - **Top:** a headline ("You found your pace at mile 1." / "Steady the whole way." / "You eased into it." / for a walk: "A good walk."), time · distance · % on goal, the pace line with the goal band shaded, and a bar under it for each song. Drag along the bars to hear and reveal each song. The hardest-hitting card comes next.
   - **Songs tab:** every song in order with its cover, title, artist, mile mark and a "you liked" / "legs liked" tag. Under it: "Legs-liked songs aren't saved until you keep them," then **Keep all N** and tapping one to keep or play it.
   - **Route tab:** your line drawn from the GPS points on the dark ground, with pins where liked songs played. Tap a pin to play its song. "Only you see the map." It only shows if GPS gave a usable route.
3. Saved songs go into Liked Songs like any save. Songs saved from a run are marked `via: 'run'`, so the Library could later show them as run songs.

### What gets stored (on the device only)
`blindspotDiscovery:runs`: a list of runs, each with id, startedAt, endedAt, goal, songs mode, typed pace, talk answer, summary (time, distance, average pace, % on goal), points every 5 s (t, lat, lng, speed, step rate), songs (track, start, end, tempo, energy, liked: you/legs/none, kept) and paused gaps. It keeps the last 50 runs. `blindspotDiscovery:runProfile` holds the learned Easy pace, natural step rate, knock calibration and run count. Every song played is also written to swipe history with `source: 'run'` (action `like` for "you liked" and `skip` otherwise), so Blind never serves it again and the stats count it.

## Platform constraints (checked)

- `expo-sensors`, `expo-location` and `expo-keep-awake` are all in Expo Go, so run mode ships to Expo Go as an update. **They're native, so the Android APK needs a rebuild and a version bump to 1.0.4.** That's the same as the earlier Skia and expo-crypto bumps. Until then, Run shows "Update the app to run" on the 1.0.3 APK instead of crashing, because the modules are loaded lazily inside try/catch.
- Expo Go has no background location on either platform (docs), and `watchPositionAsync` only updates in the foreground. Hence the black screen.
- expo-audio 57.0.4 lock screen controls offer only seek forward/back (±10 s, handled natively). There's no next-track command and no JS event for it, which is why skip and back are detected from the position jump.
- Web has no sensors. On web, and in `__DEV__`, a **simulated run** feeds made-up GPS and steps so the screens can be checked in the browser.

## Checks

- `npx tsc --noEmit` is clean. All tests pass (`node --experimental-strip-types --test $(git ls-files '*.test.ts')`).
- These pure, tested modules: step rate from samples, knock detection, pace from GPS fixes, song picking and steering, legs-liked scoring and the reveal summary, and goal pace learning.
- A web check of setup → simulated run → reveal at 390pt.
- An Expo Go update group plus QR. Then the student tests on a phone: walk around the block, knock in a pocket, lock the screen once.

## Left to the builder

Exact filter constants within the rules above, emblem drawing, copy wording within the voice, how the live screen lays out, the storage shape details, and how work is split between Claude and Codex.
