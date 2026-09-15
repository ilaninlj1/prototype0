// Every tunable constant for the pool-steering control, in one place, so
// re-tuning never means hunting through lib/pool.ts or scripts/seed-genres.ts.
// Both of those files import from here; neither hardcodes any of these values.

/**
 * NOT a selection gate for 'popular' (see popularTopPercentile below) — a
 * global absolute number failed for 26 of 37 genres (2026-09-14: only the
 * handful of biggest genres have 40+ artists at 1M+ listeners; a sub-genre
 * chart-topper isn't a global chart-topper, and "popular" is supposed to
 * mean popular *within that genre*). Kept only as a sanity-ceiling
 * diagnostic in scripts/band-genres.ts's report — how many of a genre's
 * selected 'popular' artists also clear this, so a genre's popular band
 * being entirely sub-1M is visible, not silently true of every small genre.
 */
export const artistPopularMinListeners = 1_000_000;

/**
 * 'popular' is genre-relative by construction: the top this-fraction of a
 * genre's own resolved population (after obscure has already claimed its
 * band — see percentileFallbackMinBandSize's ordering note below), ranked
 * by listeners, no absolute floor of its own. ~0.10 was picked because it
 * reproduces roughly the same absolute count (≈40 of 480) the old flat
 * top-40 fallback gave the already-healthy big genres, while scaling down
 * proportionally for smaller ones instead of taking a fixed 40 regardless
 * of population (see the Amapiano case in scripts/band-genres.ts's header).
 */
export const popularTopPercentile = 0.1;

/**
 * An artist's Last.fm `stats.listeners` at or below this (and at or above
 * artistObscureMinListeners below) is band 'obscure'. Artists strictly
 * between this and artistPopularMinListeners are dropped from the seed
 * entirely — no preset draws from that middle band. Same "seed-time only"
 * caveat as above.
 */
export const artistObscureMaxListeners = 100_000;

/**
 * 'obscure' needs a floor, not just a ceiling. Below this, an artist is
 * dropped as noise rather than seeded as 'obscure' — misfiled tracks,
 * tribute acts, and near-zero-listener uploads that are unlikely to have
 * any real iTunes catalog to resolve against.
 *
 * Measured, not guessed (2026-09-15): scripts/resolve-itunes-ids.ts
 * resolved an exhaustive n=1,500 stratified sample of below-floor artists
 * (500 each from <1K/1K-10K/10K-20K listeners) plus the full n=4,570
 * already-banded population, and scripts/report-itunes-resolution.ts
 * reported real iTunes resolution rates per bucket: <1K 58%, 1K-10K 87%,
 * 10K-20K 97%, 20K+ 98%. 10K-20K is within a point of the population
 * already in use — that's real population reclaimed (excludedTooObscure
 * ran 100-370+ per genre) for negligible quality cost. 1K would cost 11
 * points (roughly one dead artist in eight, and shorter decks); <1K is a
 * genuine cliff (58%, real noise). If this ever needs re-tuning, rerun
 * those two scripts rather than picking a new number by feel — the data
 * is cheap to regenerate and the earlier guessed value was wrong twice
 * before being measured.
 */
export const artistObscureMinListeners = 10_000;

/**
 * A track ranks as SongBand 'hit' when its 1-indexed position in its
 * artist's Last.fm getTopTracks ranking is <= this.
 */
export const hitRankMax = 3;

/**
 * A track ranks as SongBand 'deepcut' when its 1-indexed rank falls in the
 * bottom (1 - deepCutRelativeFloor) fraction of its artist's ranked catalog
 * — e.g. 0.6 means the bottom 40%. Relative to trackCountInCatalog (that
 * artist's own fetched, ranked track count), never an absolute rank band:
 * an absolute band would return nothing for an artist whose catalog is
 * smaller than the band's floor. See lib/pool.ts for how
 * trackCountInCatalog is defined against Last.fm's per-call page size.
 */
export const deepCutRelativeFloor = 0.6;

/**
 * Artists whose ranked catalog (trackCountInCatalog) is shorter than this
 * are skipped entirely for deep-cut selection (presets B and D) — too few
 * tracks for "bottom 40%" to mean anything distinct from "most of them".
 * Does not affect hit selection (presets A and C).
 */
export const deepCutMinTrackCount = 8;

/** Target number of guaranteed-playable cards per deck fill. */
export const deckSize = 10;

/**
 * Runtime pacing (2026-09-15, revised same day) — Last.fm and iTunes are
 * two independent services with two independent rate limits, so they get
 * two independent queues (lib/pool.ts's makePacer, one instance per
 * service): a slow one does not hold up the other, and there is no
 * shared budget to contend over.
 *
 * iTunes keeps its 3s spacing — that number came from this project's own
 * measured ~20/min soft limit (scripts/resolve-itunes-ids.ts tripped a
 * 429→403 block well before that), and a single deck fill is a short
 * burst (~10-20 calls) whose burst tolerance specifically has never been
 * measured, unlike the sustained-volume case that number was verified
 * against. If this is ever safely lowered, it should be because burst
 * tolerance got measured, not because 3s feels slow.
 *
 * Last.fm gets its own, much faster number: 250ms, from Last.fm's own
 * documented guidance of ~5 requests/second. It was never the constraint
 * — pacing Last.fm at iTunes's 3s was ~15x slower than Last.fm's own
 * limit needed, for no reason other than sharing one pacer with iTunes.
 */
export const lastfmDelayMs = 250;
export const itunesDelayMs = 3_000;

/**
 * getTracks() returns as soon as this many playable tracks are ready,
 * rather than waiting for a full deckSize batch — the rest keeps filling
 * in the background into an internal cache. Matches
 * lib/discovery.ts's QUEUE_TARGET_DEPTH (3) informally, not imported from
 * it (lib/pool.ts has no dependency on discovery.ts beyond the
 * DiscoveryTrack bridge type) — returning fewer than the queue engine's
 * own top-up target just means its next refill call arrives a little
 * sooner, which the leftover cache already serves instantly.
 */
export const poolQuickFillSize = 3;

/**
 * Obscure-band-only now (popular is always genre-relative — see
 * popularTopPercentile above, and note the ordering this implies: obscure
 * is computed and claims its artists FIRST, popular is computed from
 * whatever's left, precisely because obscure is the constrained side — it
 * has a floor (artistObscureMinListeners), popular doesn't — and Preset A
 * (the shipped default) draws from obscure. Giving popular first pick
 * starved obscure to zero for Amapiano (2026-09-14): its whole
 * above-floor population was only 18 artists, all of which a
 * popular-picks-first top-40 swallowed before obscure ever ran).
 *
 * Trigger and fallback target size, one number doing both jobs: if the
 * absolute-threshold obscure band comes up short of this, it's replaced
 * with the bottom N (by listeners, still respecting the floor) of the
 * genre's own resolved population instead — genre-relative, not a global
 * cutoff. This is what makes Salsa/Cumbia-style genres work without a
 * hand-maintained genre list: any genre that needs it gets it,
 * automatically, and self-corrects if Last.fm's numbers shift later.
 *
 * 40, not something close to deckSize (10): the per-session seen-artist
 * exclusion set eats into a band every refill, and this needs to survive
 * several refills before draining — 4x deckSize was picked as comfortably
 * above that, not the theoretical minimum.
 */
export const percentileFallbackMinBandSize = 40;
