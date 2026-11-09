# Testing: getting the next blind song

Prototype 9. I wrote these cases on Nov 3, 2026, before any of these tests existed, on top of commit dae3657. Results get added at the bottom once they've run.

## The behavior

Blindspot only works if the next card is a song you haven't heard. When Home runs low on cards it calls `refillQueueWithFallback` in `lib/discovery.ts`. That function should:

- Fill the queue back up to 3 songs.
- Never serve a song that's already in your swipe history.
- Move to another genre when one runs out, instead of repeating songs.
- Always finish, so Home can tell you if nothing's left or if the connection failed.

I picked this because every swipe depends on it. If it breaks, you hear repeats or stare at an empty screen, and the app stops being about finding new music.

## How the tests work

The tests will go in `lib/feed-refill.test.ts` and use Node's built-in test runner. They use made up songs and a fake fetcher, so the results don't depend on iTunes or Wi-Fi and they come out the same every run.

```
node --experimental-strip-types --test lib/feed-refill.test.ts
```

## Test cases

### Case 1, ordinary: a normal refill

- **Start:** The queue is empty, the genre is Rock, and you've already heard songs 1 and 2.
- **Action:** Refill, with Rock returning songs 1, 2, 3, 4, 5 and 6.
- **Expected:** The queue is songs 3, 4 and 5, and the genre stays Rock.
- **Why:** It needs 3 songs, 1 and 2 are out because you heard them, and it should keep the store's order when nothing's wrong.
- **My prediction:** Pass.

### Case 2, boundary: a genre has one song left

- **Start:** The queue is empty, the genre is Rock, and you've heard songs 1, 2 and 3. Jazz is available and you haven't heard any of it.
- **Action:** Refill, with Rock returning songs 1, 2, 3 and 4, and Jazz returning songs 10, 11 and 12.
- **Expected:** The queue is songs 4, 10 and 11, and the current genre changes to Jazz.
- **Why:** You should get the last new Rock song first, then the app should fill the rest from somewhere else. The genre has to change so Home shows where the songs are coming from.
- **My prediction:** Pass.

### Case 3, boundary: you've heard everything

- **Start:** The queue is empty, the genres are Rock, Jazz and Pop, and you've heard every song in all three.
- **Action:** Refill, with each genre returning only songs you've heard.
- **Expected:** The queue stays empty, the refill finishes, and it doesn't ask for more than 30 fetches, which is 6 genres times 5 tries. Home says "No songs left" and offers another genre, not a connection error.
- **Why:** An empty queue is better than a repeat, because a repeat breaks the point of the app. It also can't keep looking forever, because you'd be stuck on a spinner.
- **My prediction:** Pass.

### Case 4, failure: the connection dies halfway through

- **Start:** The queue is empty and the genre is Rock. The first fetch brings back 2 new songs. Every fetch after that fails, like when iTunes rate limits the app or the Wi-Fi drops.
- **Action:** Refill.
- **Expected:** The refill finishes without an error and the queue has those 2 songs.
- **Why:** The app already has 2 songs it can play. You should hear them, not get told it couldn't load anything.
- **My prediction:** Fail. From reading `refillQueue`, new songs sit in a local list until fetching is done, and a failed fetch throws before they reach the queue. So I think those 2 songs get lost and Home shows "Couldn't load songs". iTunes rate limits are a known problem for this app, so this could really happen.

## What these tests will show

If they pass, the logic for choosing songs is right for a normal refill, a genre running out, everything being heard, and a connection failing partway.

## What they won't show

These tests call the function directly with fake songs. They don't touch the screen, so they can't tell me if a blind card really hides the song name and cover, which is the most important thing they miss. They also don't cover how Home connects to this function, or the filter inside Home that removes artists you already know. They don't use real iTunes data either.

The song check also goes by iTunes id. If iTunes lists the same recording twice under two ids, these tests won't catch you hearing it twice.

To cover some of that on a phone, I'll repeat this by hand:

1. Open Tune, then Test network, and pick Offline.
2. Swipe until the queue runs out. Home should say "Couldn't load songs".
3. Set Test network back to Off and tap to try again. Songs should come back with blind cards.

## Results

### Run 1, on commit 3d17c4d, Nov 9, 2026

This is the first time the tests ran. The code wasn't changed first.

| Case | I predicted | What happened |
| --- | --- | --- |
| 1, a normal refill | Pass | Pass |
| 2, a genre has one song left | Pass | Pass |
| 3, you've heard everything | Pass | Pass |
| 4, the connection dies halfway | Fail | Fail |

3 passed and 1 failed, and all four matched my predictions.

Case 4 didn't finish. It stopped with the error from the fake fetcher, `iTunes rate limited the app`. That's the bug I expected. The first fetch got 2 new songs, they were still in the local list inside `refillQueue`, and the second fetch threw before they reached the queue. On a phone Home would say "Couldn't load songs" even though it had 2 songs it could play.

One limit on Case 3: the test checks that the queue comes back empty and what the "empty" state says. The line in Home that picks the "empty" state isn't tested, because these tests don't touch the screen.
