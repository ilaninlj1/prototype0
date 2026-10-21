# Figma Make prompt — Blindspot core flow redesign (iPhone)

Merged from Claude, ChatGPT (Codex) and Gemini drafts on 2026-10-21. Source board: FigJam "BlindSpot" (MY APP row + Swipefy competitor row).

## Main prompt (paste first)

```
Build an interactive iPhone prototype (393×852) of the core flow for Blindspot, a music discovery app where you hear a song blind and judge it by ear. No title, artist or cover until you choose to reveal it. Flow: listen blind → reveal it → save → find it in your Library. Include Details, the Tune sheet and the genre picker. Play and You are simple placeholder tabs.

WHAT MAKES IT DIFFERENT (show this in the design)
- It opens straight into a blind song, not a feed of music you already know.
- Discovery is about new artists and fresh genres: 37 genres with subgenres, easy to jump between.
- Saved songs show how your finds are growing ("found at 97.3K → 98.6K listeners"), so the Library is about your taste and your ear, not app achievements.

FEEL
Minimal and clean. White background, black text, one soft light-grey rounded card (corner radius about 28), and no accent color: black is the only strong color. Lots of empty space. Round icon buttons with a small grey label under each; the main action is a bigger black circle. One clean sans font like Inter. Think Apple Music's Now Playing screen, but quieter. Sound comes first: the blind card is the hero and everything else steps back. The reveal is the payoff moment. One consistent look across Home, sheets, Details and Library. Sentence-case labels, big touch targets, no walls of tiny all-caps text.

BUTTONS THAT HIDE (Home only)
While a song plays, Home shows only the card and its clues. Everything else (genre pill, Tune, Undo, the status line, the three action buttons, the pause button and the tab bar) fades out after 3 seconds without a touch. It all fades back in when you tap anywhere, when the 30-second clip ends, and always for a new user's first 5 songs. Hidden buttons keep their spot, so nothing jumps around. While they're hidden, one grey hint line sits near the bottom: "Tap anywhere for buttons · swipe the card to choose".

TAB BAR: Home · Play · Library · You

1. HOME, BLIND (the app opens here)
- Top left: genre pill "Vocal ▾" opens the Genre sheet. Top right: Undo icon, greyed out when there's nothing to undo.
- One tappable status line: "While you were gone: 2 updates on your finds ›" opens the Session sheet.
- The blind card fills most of the screen: an abstract visual that pulses at the song's tempo, progress "0:10 / 0:30", "Just listen.", and only two clues: "104 BPM · E minor". A small chip for how far it is from your usual taste: "Close to home", "New ground" or "Deep in your blind spot". Tapping the card shows or hides the buttons. Pause is a small round button on the card's top-left corner that appears with them. At 0:30 show Replay.
- Under the card, three buttons that match the gestures: "← Skip", "↓ New genre", "More like this →" (primary).
- Bottom left: "Tune · Hidden gems" opens the Tune sheet.

2. HOME, REVEALED (swipe right or tap More like this)
- The card flips into album art without stopping the music: "Afraid Of Love", "Brutha", "2008", badge "98.6K listeners · Under the radar".
- A short note above the card: "Next 3 songs sound like this one." It shows that swipes shape what plays next.
- Buttons become "♡ Save", "Details", "Next →" (primary). The first time, show a hint under the card: "Double-tap to save".

3. SAVED (tap Save or double-tap the card)
- Heart burst on the card, Save becomes "Saved ✓", the Library tab gets a +1 badge.
- A toast slides up: "Saved to Liked Songs" with "View Library" and "Send to Spotify". It hides after 4 seconds and never blocks Details or Next.

4. DETAILS (sheet over the revealed card)
- Art, title, artist, year, Save/Saved button, "Listen on" Apple Music · Spotify · Last.fm.
- Listeners: "98.6K · Under the radar" with a small meter from hidden gem to popular.
- The sound: three tiles "104 BPM · Mid-tempo", "E minor", "Medium energy".
- Call It card: "Think they'll blow up? Call it and we'll tell you if they do. 3 left this week." Tap → "Called ✓ · 2 left".
- Small "Sounds like AI?" link → "Thanks, we'll take a look."
- Credit line: "Previews courtesy of iTunes · Listener data from Last.fm".

5. NEXT SONG
A new blind card slides in ("88 BPM · A minor"). It reveals as "Cover Me With Snow" by Rebekka Bakken, 97.3K listeners.

6. GENRE SHEET
"Shuffle: explore somewhere new" button on top, a genre search, then Classical, Country, Electronic ›, Gospel, Hip-Hop ›, Jazz ›, Latin ›, Pop ›, R&B, Reggae, Rock ›, World ›. Rows with › open a few subgenres with a Back button. Header "37 genres". Picking one closes the sheet, updates the pill, flashes "Now: Jazz" on the card and loads a new blind song.

7. TUNE SHEET
A live summary on top ("Hidden gems · slow · calm"), also shown on the Home Tune button.
- How well-known: Mixed / Hidden gems / Deep cuts / Popular
- What plays next: Artist / Similar / Genre / Random ("Stay in this genre until you swipe down.")
- Sound: Pace slow/any/fast, Energy calm/any/loud, Texture acoustic/any/electronic, Mood major/any/minor, Groove steady/any/danceable. "Any" is the default.
- More (collapsed): Store region "US", AI-made music Show/Hide ("AI acts are labeled when revealed").
- Reset and Done. Changes apply to upcoming songs, not the one playing.

8. SESSION SHEET (from the status line)
Holds the extras that used to crowd Home: "Daily Drop No. 17 · Play", "Edition No. 1 is ready · Play", "Your piece: 18 of 50 prints" with a small line graph of this session's reveals and skips (tap → You tab), and the 2 updates on your finds (a listener milestone, a new release).

9. LIBRARY TAB (replaces the old Liked Tracks sheet and uses the same look as the rest of the app)
- Search "Songs, artists or albums".
- Top card: "Best find: Philip Bailey ↑ 2% since you found it · Your calls: 0 hit, 1 waiting".
- Tabs: Liked songs · Playlists. Genre chips: All, R&B, Funk, Electronic, Alternative.
- 2-column grid: cover, title, artist, listener change. Seed it with "Alone Together" by Daley 83.5K → 83.8K, "Nothing I'd Rather Be" by Marva Whitney 88.4K → 88.5K, "Love Went Without Saying" by Tigerskin 80.1K → 80.2K. New saves go on top with "Found at 98.6K · today".
- Tap a song → Details. "•••" on a song: Add to playlist, Send to Spotify, Remove (with Undo).
- Playlists: one in-app playlist "Late night finds · 6 songs", "+ New playlist", and "Send to Spotify" on each playlist.
- Small links: Export history, Recently deleted.
- Empty state when nothing is saved: "Nothing saved yet. Double-tap a song you love to keep it here." Button "Start listening". No stats in the empty state.

10. SEND TO SPOTIFY SHEET (from the toast or the Library)
"Already saved in Blindspot. Want it in Spotify too?" First time: "Connect Spotify" (simulated). Then pick a playlist ("Road trip", "Sunday morning", "+ New playlist") → "Sent to Road trip ✓". Spotify is always optional, and Cancel keeps the Blindspot save.

11. PLAY and YOU (placeholders)
Play: "Pick a game · 8 modes" and a Daily Drop card: "Same five songs for everybody today. One of them is secretly huge." You: "Your ears" with Piece / Discoveries / Insights tabs and one sample line each.

GESTURES
Drag the blind card right = more like this + reveal, left = skip, down = new genre. The card follows the finger and tilts, shows the action word at the edge, and springs back if let go early. Double-tap = save; on a blind card it reveals and saves in one go. On the revealed card, swipe left or right = next, down = new genre. Every gesture also has a visible button. Sheets close by swiping down.

RULES
- Never show the current song's title, artist, art, year or listener count before it's revealed, not in toasts or anywhere else.
- More like this reveals, it doesn't save. Only Save or a double-tap saves. Saving twice never makes a duplicate.
- Keep state when switching tabs: current song, genre, Tune settings, saves, calls. Leaving Home pauses the preview.
- No real audio or accounts needed. Simulate playback, the timer, Spotify and the listen-on links.
- No login, onboarding, social feeds or upsells. Respect reduced motion.
```

## Follow-up prompts (only if the first build misses these)

1. `The blind card has to be draggable with touch or mouse, not just buttons. Follow the finger, tilt up to 8°, show "Skip", "More like this" or "New genre" at the edge, commit past 30% of the screen, otherwise spring back.`
2. `Make Library, Details and every sheet use the same components, spacing and type as Home so it reads as one app. Text at least 13pt, touch targets at least 44pt.`
3. `Show me the Library empty state and the first-time "Connect Spotify" step so I can check both.`
