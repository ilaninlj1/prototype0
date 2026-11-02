# People: design

**Date:** 2026-11-02. **Status:** building. The student said "continue build" after the three proposed defaults, so they count as agreed. Everything marked *(Claude's call)* is for the student to check.

## Why

The student, 2026-10-29: "instead of swiping like in tinder, you swipe the song." "Both? u never know which can pop" (friends and dating). "Twins is horrible... adding tons of attention to detail and making it a whole new tab." Taste Twins is a card in Play that opens a plain list of percentages. Nobody feels anything there.

Blindspot's idea is that you judge a song with nothing else in the way. People does the same to meeting someone: you judge what they love before you know they exist.

## What it is

A fifth tab, in the middle: Home · Play · **People** · Library · You.

The first thing you see is a blind song, not a person. Every song in this deck is one that someone else in People hearted. You don't know who, or how many, until you've decided. Right is a heart (it goes in your Library and shows you who it is), left is a pass.

When enough of your hearts land on the same songs as someone else's, that person appears in the row above the card. Each one is a taste print and a first name, never a face. You open them, see the songs you share, and wave. If they wave back, you each see one handle, and you talk there.

## Goals

- The song really is the swipe. You can't browse people.
- Works with 15 testers. The deck is made from members' own hearts, so two people overlap within minutes. Random overlap in a 10,889-song catalog would be about zero.
- A match means something. It's corrected for chance, so someone who hearts everything matches nobody.
- Every step leaves a number the paper can use: each match shown, wave and wave back, with its score.

## Non-goals (this build)

- In-app chat, photos, free-text bios. See "What the student first asked for".
- Gender or "show me" filters *(Claude's call: both people have to wave, so nobody is contacted without saying yes. Add if testers ask.)*
- Location. Bottles has it; People doesn't need it.

## Anti-goals: a failure even if it technically works

- Anyone gets contacted who didn't say yes.
- A dating wave reaches someone who picked Friends.
- It feels like a profile grid. If you can scroll through people, it has become Tinder with worse photos.
- Someone under 18 is put in front of adults. See the limit below.

## What the student first asked for, and what changed

On 2026-10-29 the student asked for "more info and pic if u want", "messages", and later "a chat box with everyone". Claude proposed no photos and no chat. Reasons: photos need moderation this project can't staff, open chat with strangers and a self-declared age is the highest-risk thing the app could add, and WeChat Drift Bottle was shut down over exactly that. Swapping a handle moves the talking to an app that has its own moderation. This is the most likely thing to come back. A later phase could add chat that only opens after both wave, with reports, if there's a way to review them.

## The three decisions

1. **18+ for the whole tab.** Stronger than Twins, where under-18s could see lists. Asked as a month and year with no hint of the cutoff, per the FTC's neutral age screen guidance. Under 18 locks the tab on this phone and asks nothing else. The birth date never leaves the phone; only `adult = true` does.

   **The limit, stated plainly:** this is self-declared. It deters kids and it keeps honest ones out, but it can't guarantee no minors, and reinstalling clears the lock. Real assurance needs Apple's Declared Age Range and Google's Age Signals, which are native builds, so that's for a store release. A single "might be under 18" report hides a profile at once.

2. **Ask before uploading.** The first open lists what leaves the phone and People stays closed until you agree. Leaving deletes all of it.
3. **One handle.** Instagram, Snapchat, TikTok or Discord, seen only after both wave. Optional at join.

## The match

The student's idea: both people get the same cards, count agreement, and find the right ratio by testing. Two things had to change, because most blind songs get skipped, so two strangers "agree" about 68% of the time by both skipping.

So only hearts count, and they're compared with chance:

- For each person, `rate` is how often they heart a card in this deck, `(hearts + 1) / (cards + 5)`, so a new member starts near 20%.
- `expected` is how many shared hearts chance would give: their hearts you've heard × your rate, and your hearts they've heard × their rate. Take the larger, so one generous swiper can't inflate a match.
- `weighted` counts each shared heart as 1 for a million-listener artist up to 2 for under a thousand listeners. Rare overlaps mean more.
- `score = (weighted + 1) / (expected + 1)`. 1 means chance. The +1s pull small samples toward "unknown".

**In tune** needs at least 3 shared hearts, at least 15 songs you've both judged, and a score of at least 1.25.

All three live in the `people_settings` table so they can be tuned from the dashboard with no new build. The screen says it in one sentence: "You both hearted 5 of the same songs. Chance says about 2."

These numbers are starting guesses. With 15 testers there isn't enough data to prove them, so the showcase is a pilot and the paper should say so. `people_shown` plus `twin_waves` gives the wave and wave-back rate by score, which is the student's iteration idea.

## Friends and dating

Everyone picks Friends, Dating or Either, and can change it anytime.

| You \ Them | Friends | Dating | Either |
|---|---|---|---|
| **Friends** | friends | no match | friends |
| **Dating** | no match | dating | dating |
| **Either** | friends | dating | either |

The server decides this, and both people see the same label on the person page.

## The tab

Three states, one screen.

**Not joined:** "You swipe the song, not the person." Then one question per screen: month and year, what leaves your phone, then first name, Friends/Dating/Either and an optional handle.

**Joined:**
- **Top: the in-tune row.** Taste prints with a first name, sideways. A red dot means they waved. Empty, it says how close you are: "1 person is getting close" or "12 songs here so far".
- **Middle: the song.** Home's `ListenCard`, the same particles, drag and reveal in place, so it feels like the app. The first card waits for a tap so the tab doesn't start shouting when you're only checking who waved.
- **Bottom: ✕ and ♥,** round buttons with a word under each, like Home.
- **After a heart:** it reveals in place, with the name and "3 other people here hearted this". Counts only ever show after the verdict (Salganik's MusicLab finding on herding).

**In tune moment:** when a heart makes a new match, a dark full screen. Your print and theirs drift in from the edges and overlap, a ripple runs out from where they meet, one haptic. "In tune with Maya", the chance sentence, Wave and Later.

**The person page:** their print large, with a song you share at its core, rings from their own hearts. Name, the Friends/Dating label, the chance sentence, the shared songs with play buttons, Wave. After both wave: the handle, plus what else they hearted. Before that, only what you share. Block and Report at the bottom.

**A taste print instead of a face:** up to 12 rings, one per recent heart, in the shape Bottles already draws (`lib/bottle-print.ts`): hue from key and mode, weight from energy, breath from tempo. Only those four numbers per ring go up, never the song ids.

## Server

`supabase/people.sql`, on top of `twins.sql` and `twins-fixes.sql`. It reuses their profiles, likes, waves, blocks and reports so members and safety rules carry over.

- `twin_profiles` gains `intent`, `print`, `people_at` (set only by `join_people()`). `twin_likes` stays the record of hearts: everything hearted anywhere is in the Library, and it already syncs.
- `people_swipes`: every verdict in this deck, one row per person and song. RLS on, no direct grants.
- `people_settings`: the three tunable bars.
- `people_shown`: pairs shown, with the score at the time.
- `people_deck(lim)`: track ids hearted by members you could match, that you haven't judged, at most half from any one person, closest people first. With how many hearted each, which the phone holds back until the verdict.
- `people_swipe(track, hearted)`, `my_people()`, `person_songs(person)`, `people_log_shown(...)`, `people_progress()`.
- **Twins is retired on the server too:** `my_twins()` returns nothing and `twin_songs()` only answers for a mutual wave, so an old build can't list People members to anyone. Old members have to join People themselves; their old agreement didn't cover this.
- `leave_twins()` and `claim_twin_profile()` learn about the new tables.

## Safety: what comes from the server is untrusted

Same rule as Bottles. Every row is parsed and validated before use. Track ids are resolved through the catalog or iTunes, never a URL from the server. Print numbers are clamped.

**Reports need a reader.** They go to `twin_reports`, and nobody reads that table today. Fine for class testers. Before this opens wider, someone has to.

## Phases

1. **This build:** the tab, the join flow, the deck, the match, the moment, the person page, Twins retired.
2. **Next:** songs as your profile ("the song I'd play you first", picked from your Library), and a wave offered right after you keep a bottle.
3. **If testers want it:** chat that opens only after both wave.

## For the paper

Song-first matching versus Twins' list: waves per match shown, wave-backs per wave, and whether the score predicts wave-backs. Report the small sample honestly.
