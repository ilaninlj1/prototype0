# Minimal UI, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the light theme, the minimal Home with hiding buttons, the saved toast and a four-tab bar with a basic Library tab, as one phone-testable build.

**Architecture:** `constants/theme.ts` turns light. A new `DarkColors` set keeps today's navy for the blind card and the three dark experiences. The rules for when the buttons show are a pure module, `lib/home-chrome.ts`, read through a small store so the tab bar (outside Home) can hide too. Home's chrome fades in a wrapper that keeps its space. The card loses its text: a new `ListenInfo` under it carries the clues, or the title once revealed.

**Tech Stack:** Expo SDK 57 (read https://docs.expo.dev/versions/v57.0.0/ before code), Expo Router v6, Reanimated, react-native-gesture-handler, Skia (unchanged), Node's built-in test runner with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-21-minimal-ui-design.md` (and the `docs/figma-make-core-flow-prompt.md` it points to).

## Global Constraints

- Work only in `~/Desktop/prototype0-minimal` on branch `minimal-ui`. Never merge or push.
- No new native modules, and no `package.json` dependency changes.
- Light tokens: background `#FFFFFF`, surface `#F2F2F2`, text `#111111`, secondary `#6B6B6B`, accent `#111111` with white text, signal `#E63946` for the heart, saves, streaks and big numbers only. Small text must be at least 4.5:1.
- `DarkColors` = today's navy values, unchanged. They're used by the blind card, `StackFace`, the drag labels, the Edition, the Dark Map and Rewind.
- Timing: buttons hide after **3000 ms** without a touch, the fade is **250 ms** (none with reduced motion), the user's **first 5 songs** keep them up, and the saved toast hides after **4000 ms**.
- Copy on Home and the tab bar is sentence case. No uppercase mono walls, no emoji, no violet.
- The iTunes and Last.fm credits (`CreditLine`) stay on Home inside the hiding layer.
- The discovery engine, queue, pool, sound and map logic, and swipe and lock behavior stay as they are.
- Each commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test command: `node --experimental-strip-types --test $(git ls-files '*.test.ts')`. Type check: `npx tsc --noEmit`.

## Review Focus

1. **A card tap versus a swipe or double-tap.** Showing and hiding must never eat a swipe, and a double-tap must still save. *(Checked in Task 6, step 6.)*
2. **Something opens while the buttons are hidden.** This includes Details, Finds News, Tune and the genre sheet. They must pin the buttons up, and the 3 s timer starts over when they close. *(`sheetOpen` tests in Task 2; wiring in Task 6.)*
3. **The tab bar after leaving Home.** It must be visible on every other tab, even if Home hid it. *(`tabBarVisible` tests in Task 2.)*
4. **No card on screen** (loading, failed, offline). The buttons stay up. *(`feedStatusUp` tests in Task 2.)*
5. **Text that sits on the dark card.** It must stay light after the token flip. *(Contrast test in Task 1; visual check in Task 10.)*

---

### Task 1: Light tokens, `DarkColors`, and the dark experiences

**Files:**
- Modify: `constants/theme.ts`, `app/_layout.tsx` (navigation theme and `StatusBar`)
- Modify (switch `Colors` to `DarkColors`): `app/edition.tsx`, `app/map.tsx`, `app/rewind.tsx`, `components/map/*.tsx`, `components/rewind/*.tsx`, `components/edition/edition-poster.tsx`, `components/print/poster-canvas.tsx`, `components/print/piece-canvas.tsx`
- Test: `constants/theme.test.ts`

**Interfaces:**
- Produces: `DarkColors` (the same keys as `Colors`) and `contrastRatio(a: string, b: string): number` (hex in, WCAG ratio out), both exported from `constants/theme.ts`.

- [ ] **Step 1: Write the failing test** `constants/theme.test.ts`:
  - `contrastRatio('#FFFFFF', '#000000') === 21`
  - `contrastRatio(Colors.text, Colors.background) >= 4.5`, `contrastRatio(Colors.textSecondary, Colors.background) >= 4.5` and `contrastRatio(Colors.accentText, Colors.accent) >= 4.5`
  - `contrastRatio(DarkColors.text, DarkColors.background) >= 4.5`
  - `DarkColors.background === '#13213f'`, `DarkColors.text === '#f3ead8'`, `Colors.background === '#FFFFFF'`
- [ ] **Step 2:** Run `node --experimental-strip-types --test constants/theme.test.ts`. Expected: FAIL, no `contrastRatio` export.
- [ ] **Step 3: Implement.**
  - Copy today's `Colors` object to `DarkColors`.
  - Set `Colors` to the light values in Global Constraints:
    - surfaceElevated `#FFFFFF`
    - border `rgba(17,17,17,0.08)`, hairline `rgba(17,17,17,0.16)`, rule `rgba(17,17,17,0.10)`
    - textTertiary `#8A8A8A`
    - tint `#111111`, icon `#6B6B6B`
    - highlight `#f4c542`, destructive `#E63946`, positive `#2E8B57`
  - Add `contrastRatio` using WCAG relative luminance (sRGB linearization).
  - Update the file's header comment, since the app is no longer dark-only.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** In `app/_layout.tsx`, base `customTheme` on `DefaultTheme` (from `expo-router/react-navigation`) instead of `DarkTheme`, and set `<StatusBar style="dark" />`. In `app/edition.tsx`, `app/map.tsx` and `app/rewind.tsx`, render `<StatusBar style="light" />` so the bar flips back while they're on screen.
- [ ] **Step 6:** Replace `Colors` with `DarkColors` in every file listed above. Use a find-and-replace on the import and its usages, and leave hardcoded hex values alone.
- [ ] **Step 7:** Run `npx tsc --noEmit`. Expected: clean.
- [ ] **Step 8:** Commit: "Theme: the app goes light; DarkColors keeps navy for the card, Edition, Dark Map and Rewind".

### Task 2: When the buttons show (pure rules plus the store)

**Files:**
- Create: `lib/home-chrome.ts`, `lib/home-chrome.test.ts`, `hooks/use-home-chrome.ts`

**Interfaces:**
- Produces, from `lib/home-chrome.ts`:
  - `HIDE_AFTER_MS = 3000`, `FADE_MS = 250`, `LEARNING_SONGS = 5`, `TOAST_MS = 4000`
  - `type ChromeState = { now: number; lastWakeAt: number; hiddenByTap: boolean; songsDecided: number; clipEnded: boolean; feedStatusUp: boolean; sheetOpen: boolean; screenReader: boolean }`
  - `pinnedOpen(s: ChromeState): boolean`, which is true when `songsDecided < LEARNING_SONGS`, clipEnded, feedStatusUp, sheetOpen or screenReader
  - `chromeVisible(s: ChromeState): boolean`, which is `pinnedOpen(s) || (!s.hiddenByTap && s.now - s.lastWakeAt < HIDE_AFTER_MS)`
  - `msUntilHide(s: ChromeState): number | null`, which is null when pinned or already hidden
  - `tabBarVisible(focusedRoute: string, homeChromeVisible: boolean): boolean`, which is true unless `focusedRoute === 'index'` and the chrome is hidden
- Produces, from `hooks/use-home-chrome.ts`:
  - `setHomeChromeVisible(v: boolean): void` and `useHomeChromeVisible(): boolean`, a `useSyncExternalStore` store that starts at true
  - `useHomeChrome(inputs: { songsDecided: number; clipEnded: boolean; feedStatusUp: boolean; sheetOpen: boolean }): { visible: boolean; wake: () => void; toggleFromCard: () => void }`. This hook:
    - tracks `screenReader` via `AccessibilityInfo.isScreenReaderEnabled()` plus the `screenReaderChanged` listener
    - stamps `lastWakeAt` on mount
    - schedules one `setTimeout(msUntilHide)` that re-renders
    - publishes `visible` through `setHomeChromeVisible`
  - `toggleFromCard` hides it (`hiddenByTap = true`) when visible and not pinned. Otherwise it wakes it.

- [ ] **Step 1: Write the failing tests** in `lib/home-chrome.test.ts`. Base the state on `{ now: 10000, lastWakeAt: 10000, hiddenByTap: false, songsDecided: 50, clipEnded: false, feedStatusUp: false, sheetOpen: false, screenReader: false }`, then check:
  - visible at +0 and at +2999, hidden at +3000
  - with `lastWakeAt: -Infinity`, hidden at songsDecided 5 and visible at songsDecided 4
  - visible at +60000 when any one of `clipEnded`, `feedStatusUp`, `sheetOpen` or `screenReader` is true
  - `hiddenByTap: true` at +0 is hidden, but visible again with `screenReader: true`
  - `msUntilHide` is 2000 at +1000, null when pinned, and null at +5000
  - `tabBarVisible('play', false)` is true, `('index', false)` is false, and `('index', true)` is true
- [ ] **Step 2:** Run `node --experimental-strip-types --test lib/home-chrome.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `lib/home-chrome.ts`, which must stay free of React Native imports.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Implement `hooks/use-home-chrome.ts` as specified above.
- [ ] **Step 6:** Run `npx tsc --noEmit`. Expected: clean.
- [ ] **Step 7:** Commit: "Home chrome: rules for when the buttons show, and a store the tab bar can read".

### Task 3: The status line and the clues, in words

**Files:**
- Create: `lib/status-line.ts`, `lib/status-line.test.ts`, `lib/home-copy.ts`, `lib/home-copy.test.ts`
- Modify: `lib/taste-distance.ts` (`TIER_LABEL` to sentence case, and any test that asserts the old strings)

**Interfaces:**
- Produces, from `lib/status-line.ts`:
  - `type StatusItem = { kind: 'failed' } | { kind: 'edition'; n: number } | { kind: 'news'; count: number } | { kind: 'map'; words: string } | { kind: 'more'; label: string } | { kind: 'sorted'; text: string }`
  - `type StatusInputs = { failedOffline: boolean; editionReady: number | null; newsCount: number; mapWords: string | null; moreLabel: string | null; sortedText: string | null }`
  - `pickStatus(i: StatusInputs): StatusItem | null`, using the spec's priority order: failed, edition, news, map, more, sorted
  - `statusText(item: StatusItem): string`
- Produces, from `lib/home-copy.ts`: `cluesLine(label: string | null, tier: string | null): string | null`
- Produces, from `lib/taste-distance.ts`: `TIER_LABEL = { close: 'Close to home', new: 'New ground', deep: 'Deep in your blind spot' }`

- [ ] **Step 1: Write the failing tests.**
  - `pickStatus`: with every input set, the result is `{kind:'failed'}`. With failed off, it's the edition. With none set, it's null. With news 0 and map words `'warm · slow'`, it's `{kind:'map', words:'warm · slow'}`.
  - `statusText`:
    - failed → `Couldn't load more songs · Try again`
    - `{edition, n: 2}` → `Edition No. 2 is ready · Play`
    - `{news, count: 1}` → `While you were gone: 1 update`
    - `{news, count: 3}` → `While you were gone: 3 updates`
    - `{map, words:'warm · slow'}` → `In the dark · warm · slow ✕`
    - `{more, label:'Brutha'}` → `More like this: Brutha`
    - `{sorted, text:'slow, calm'}` → `Sorted: slow, calm`
  - `cluesLine`:
    - `('104 BPM · E MINOR', 'Close to home')` → `104 BPM · E minor · Close to home`
    - `('148 BPM · C♯ MAJOR', null)` → `148 BPM · C♯ major`
    - `(null, 'New ground')` → `New ground`
    - `(null, null)` → null
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement both modules. `cluesLine` lowercases only the words `MAJOR` and `MINOR`. Change `TIER_LABEL`, then `grep -rn "CLOSE TO HOME\|NEW GROUND\|DEEP IN YOUR" app components lib` and update every match.
- [ ] **Step 4:** Run the full test command. Expected: all PASS.
- [ ] **Step 5:** Commit: "Home copy: one status line in priority order; the clues in sentence case".

### Task 4: The card loses its text; `ListenInfo` under it

**Files:**
- Create: `components/home/listen-info.tsx`
- Modify: `components/home/listen-card.tsx`, `components/home/drag-label.tsx` (`Colors` to `DarkColors`), `components/home/piece-strip.tsx` (show `n/50`)

**Interfaces:**
- Consumes: `cluesLine` (Task 3), `DarkColors` (Task 1)
- Produces: the `ListenCard` props drop `slotLabel`, `tierLabel`, `listeners` and `onCallSave`, and `onTogglePlay` is renamed `onTap`. Everything else is unchanged.
- Produces: `ListenInfo({ track, revealed, clues, listeners, onCallSave }: { track: DiscoveryTrack; revealed: boolean; clues: string | null; listeners: number | null | undefined; onCallSave?: (t: DiscoveryTrack) => Promise<void> })`
- Produces: `PieceStrip` gets a `slotText: string` prop, for example `"18/50"`, shown at the strip's right end.

- [ ] **Step 1: Slim the card.** In `listen-card.tsx`, remove `topRow`, `blindFoot`, `Gradient`, the names block and `callRow`, along with their styles. The tap gesture now calls `onTap`. Every `Colors` in the file becomes `DarkColors`. Keep the cover, print, tints, paused icon, badge, progress line, `DragLabels` and `HeartBurst`.
- [ ] **Step 2: Write `ListenInfo`.**
  - Blind: `Just listen.` in `Typography.subtitle`, then the clues line in `Typography.caption`.
  - Revealed: the title (`Fonts.display` 22/26), then `artistName` plus `releaseLine(...)`, then a row with the listener count (`describeListeners`) and `CallButton`. It fades in with `FadeIn.delay(700)`, or no delay with reduced motion.
  - It reserves a fixed height of 92, so the buttons below never move.
- [ ] **Step 3:** Add `slotText` to `PieceStrip`.
- [ ] **Step 4:** Run `npx tsc --noEmit`. Expected: errors only in `app/(tabs)/index.tsx`, which is fixed in Task 6.
- [ ] **Step 5:** Commit: "Home card: the print and cover only; ListenInfo carries the clues and the name".

### Task 5: Round buttons, the corner pause, the fade wrapper and the toast

**Files:**
- Modify: `components/home/action-row.tsx`
- Create: `components/home/chrome-fade.tsx`, `components/home/corner-pause.tsx`, `components/home/saved-toast.tsx`

**Interfaces:**
- Consumes: `FADE_MS` and `TOAST_MS` (Task 2)
- Produces:
  - `ActionRow`: the same props as today.
  - `ChromeFade({ visible, alwaysShow = false, style, children })`: Reanimated opacity `withTiming(FADE_MS)`, or instant with reduced motion. `pointerEvents` is `'box-none'` when shown and `'none'` when hidden. Hidden also sets `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.
  - `CornerPause({ paused, onPress }: { paused: boolean; onPress: () => void })`: a 40 pt white circle with a pause or play icon, and the a11y label "Pause" or "Play".
  - `SavedToast({ visible, onViewLibrary, onHide }: { visible: boolean; onViewLibrary: () => void; onHide: () => void })`: shows "Saved to Liked Songs" and a "View Library" button, and calls `onHide` after `TOAST_MS`.

- [ ] **Step 1: Restyle `ActionRow`.** The row is centered with a 32 gap. Secondary buttons are 56 pt circles (`Colors.surface`, icon `Colors.text`) with a 12 pt `Colors.textSecondary` label under them. The primary is a 72 pt circle (`Colors.accent`, icon `Colors.accentText`) with a semibold `Colors.text` label. Blind icons: arrow-back, arrow-down, arrow-forward. Revealed icons: heart, or `Colors.signal` heart when saved, then information-circle-outline, then arrow-forward. Keep the a11y labels.
- [ ] **Step 2:** Write `ChromeFade`, `CornerPause` and `SavedToast`. The toast is a black rounded bar with white text, pinned above the tab bar, and it must not cover the action row.
- [ ] **Step 3:** Run `npx tsc --noEmit`. Expected: only the index.tsx errors left from Task 4.
- [ ] **Step 4:** Commit: "Home pieces: round action buttons, the fade wrapper, corner pause, saved toast".

### Task 6: Icon triggers, then wiring Home together

**Files:**
- Modify: `components/discovery/tune-sheet.tsx`, `components/discovery/genre-picker.tsx`, `components/home/map-button.tsx`, `app/(tabs)/index.tsx`

**Interfaces:**
- Produces:
  - `TuneSheet` gets `trigger?: 'button' | 'icon'` (default `'button'`) and `onOpenChange?: (open: boolean) => void`. The icon trigger is a 44 pt round button with `options-outline` and the a11y label "Tune: {preset}".
  - `GenrePicker` gets `onOpenChange?: (open: boolean) => void`, and its trigger becomes a light pill.
  - `MapButton` gets `variant?: 'icon'`: `map-outline` with the lit % in 11 pt text.
- Consumes: Tasks 2 through 5.

- [ ] **Step 1:** Add the `trigger`, `onOpenChange` and `variant` props. `onOpenChange` fires on every `setVisible` change.
- [ ] **Step 2: Lay out Home.** In `index.tsx`, top to bottom:
  - `ChromeFade` around the status line, with `alwaysShow` when the item is `failed`. The status line is `pickStatus`/`statusText` in one `Pressable` row; a tap runs the old handler for that kind.
  - `ChromeFade` around the top bar: the `GenrePicker` pill on the left; `MapButton variant="icon"`, `TuneSheet trigger="icon"` and `UndoButton` on the right.
  - The card area as today, plus `CornerPause` in a `ChromeFade` at the card's top-left.
  - `ListenInfo`.
  - `ChromeFade` around `ActionRow`, `PieceStrip` and `CreditLine`.

  Remove `DropRing`, `LikedTracksButton`, the news strip and the old note line from Home.
- [ ] **Step 3: Wire the visibility.** Call `useHomeChrome` with:
  - `songsDecided: swipeHistory.length`
  - `clipEnded`: true once `status.didJustFinish` fires, false again on the next track change
  - `feedStatusUp: !currentTrack`
  - `sheetOpen`: any of `detailsOpen`, `newsSheetVisible`, the Tune open state or the genre open state

  Put an absolute-fill `Pressable` behind the content (`onPress={chrome.wake}`) and give the content containers `pointerEvents="box-none"`. Wrap every button handler in Home so it also calls `chrome.wake()`.
- [ ] **Step 4:** Pass `onTap={chrome.toggleFromCard}` to `ListenCard`. Use `CornerPause` for `onPress={handleTogglePlay}`.
- [ ] **Step 5: Add the hint and the toast.** While the buttons are hidden, show one `Colors.textSecondary` line 150 pt above the bottom: "Tap anywhere for buttons · swipe the card to choose" when blind, or "Double-tap to save · swipe for the next song" when revealed. Show `SavedToast` when `handleSave` turns a song saved. "View Library" calls `router.navigate('/library')`.
- [ ] **Step 6:** Run `npx tsc --noEmit` and the full tests. Expected: clean and PASS. Then check by reading the code that `Gesture.Race(pan, Gesture.Exclusive(doubleTap, tap))` is untouched in `listen-card.tsx`, which is Review Focus 1.
- [ ] **Step 7:** Commit: "Home: minimal layout; the buttons hide after 3 s and come back on a tap, a clip's end, or a sheet".

### Task 7: Four tabs, a light tab bar that hides with Home

**Files:**
- Modify: `app/(tabs)/_layout.tsx`, `components/tab-bar.tsx`, `components/save-flight.tsx`

**Interfaces:**
- Consumes: `useHomeChromeVisible`, `tabBarVisible`, `FADE_MS` (Task 2)
- Produces: `setSaveTabTarget` (renamed from `setYouTabTarget` in `save-flight.tsx` and its one caller). It's now attached to the Library tab icon.

- [ ] **Step 1:** In `_layout.tsx`, add `<Tabs.Screen name="library" options={{ title: 'Library' }} />` between play and explore.
- [ ] **Step 2: Restyle the tab bar.**
  - `ICONS` labels become Home, Play, Library, You, and library gets the `albums-outline`/`albums` icons.
  - Labels are Figtree 600 at 12 pt: `Colors.text` when active, `Colors.textSecondary` when idle.
  - The indicator is `Colors.text`.
  - The save flight lands on Library, which shows a `+N` badge (N = landings since Library was last focused). The Decoded dot stays on You.
  - Play shows a small `Colors.signal` dot while today's drop is unplayed. Reuse `DropRing`'s played check through `useDailyDrop`.
  - The whole bar fades with `tabBarVisible(state.routes[state.index].name, useHomeChromeVisible())` and keeps its height, so Home never jumps.
- [ ] **Step 3:** Run `npx tsc --noEmit`. Expected: an error for the missing `library` route, which Task 8 fixes. Commit with Task 8.

### Task 8: The Library tab (moved list)

**Files:**
- Create: `components/library/liked-tracks-screen.tsx` (moved from `app/modal.tsx` with `git mv`), `app/(tabs)/library.tsx`
- Modify: `app/modal.tsx` (becomes `<Redirect href="/library" />`)

**Interfaces:**
- Produces: `LikedTracksScreen()` (the same component). It gets top safe-area padding and a "Library" heading in `Typography.title`. Its steering exit (`router.back(); router.navigate('/')`) becomes `router.navigate('/')`.

- [ ] **Step 1:** Run `git mv app/modal.tsx components/library/liked-tracks-screen.tsx`. Fix its relative imports, apply the changes above, and export `LikedTracksScreen`.
- [ ] **Step 2:** `app/(tabs)/library.tsx` renders `<LikedTracksScreen />`. `app/modal.tsx` redirects to `/library`, so the weekly nudge (`lib/nudge-config.ts` url `/modal`) still lands.
- [ ] **Step 3:** Run `npx tsc --noEmit` and the full tests. Expected: clean and PASS, including `lib/nudge-config.test.ts`, which is unchanged.
- [ ] **Step 4:** Commit Tasks 7 and 8: "Tabs: Home · Play · Library · You, light, hiding with Home; the Liked list becomes the Library tab".

### Task 9: Docs

**Files:**
- Modify: `CLAUDE.md` (Routing, Tabs, Home, `modal` route and Theming entries), `changelog.md`, `features.md` (one dated entry: Minimal UI phase 1, linking the spec)

- [ ] **Step 1:** Update the entries so they describe the code as it now stands.
- [ ] **Step 2:** Commit: "Docs: Minimal UI phase 1".

### Task 10: Check and phone build

- [ ] **Step 1:** Run `npx tsc --noEmit` and the full tests. Expected: clean, and every test passes.
- [ ] **Step 2: Web preview at 390 pt.** Use the temporary web prep: set `web.output` to "single" in `app.json` and add `&& false` to the landing gate in `app/_layout.tsx`. Then run `npx expo export -p web`, serve it with an `index.html` fallback, and screenshot Home blind, Home after a tap, a revealed card, Library, Play and You over CDP touch emulation. Revert both temporary edits with `git diff` showing nothing (never `git checkout app/_layout.tsx`). Check that text on the dark card is light (Review Focus 5) and that the tab bar shows on Play (Review Focus 3).
- [ ] **Step 3: Phone build.** Run `npx expo export -p ios -p android --output-dir <scratch>/minimal-p1`, then `eas update --skip-bundler --input-dir <scratch>/minimal-p1 --branch expo-go --environment preview --message "Minimal UI phase 1" --non-interactive` with `EAS_SKIP_AUTO_FINGERPRINT=1`. Make a QR PNG of `exp://u.expo.dev/<projectId>/group/<groupId>` at `~/Desktop/blindspot-minimal-p1-qr.png`.
- [ ] **Step 4:** Report to the student with the QR and what to try.

---

Phases 2–4 (the Library finished, the sheets and the rest of the app, playlists and Spotify) get their own plans once phase 1 has passed the student's phone check.
