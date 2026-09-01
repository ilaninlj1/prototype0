# Bugs

Known bugs and issues, logged as dated entries. At the start of every session, entries older
than 30 days are flagged as a reminder (see the checklist in `CLAUDE.md`).

Add new entries at the top, newest first.

## Format

```
## [YYYY-MM-DD] Short title
Description of the bug, repro steps, and any relevant context.
```

## Entries

<!-- Add entries below this line -->

## [2026-09-01] Reveal screen showed inverted mismatch results

`isMismatch()` in `lib/taste-test.ts` had both comparison operators flipped:
it returned true when a disliked-genre track was rated <= 2 and when a
liked-genre track was rated >= 4 — the opposite of a mismatch.

Effect: the app built and ran normally, but the reveal screen inverted its
verdict. Tracks I rated in line with my stated genre preferences were flagged
as surprises, and the genuine surprises were shown as expected results. No
crash, no error, no visible symptom until you actually read the results and
noticed they made no sense.

Repro: pick a genre as "liked", rate one of its tracks 5, go to the reveal
screen — it reports a mismatch.

Fix: restored the operators to `disliked && rating >= 4` and
`liked && rating <= 2` (commit 95b9724).
