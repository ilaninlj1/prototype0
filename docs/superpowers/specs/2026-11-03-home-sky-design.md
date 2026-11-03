# Home's sky and sea life

The user: "I feel like a white background sucks." They wanted a sky above the sea on Home, then a little floating island with a windsock and a sign that flips in the wind, then animals surfacing at real distances on real schedules. They picked the Real sky look over Ink, Crayon and Cut paper.

Playable reference: https://claude.ai/artifact/LwrrYAaie1B5zfSngcQcTk (a mock, not this code). It has the source links for every animal fact.

This overrides the Ocean design's "The white stays white. The water is the only new thing on Home."

## What's built (phase 1)

- **The clock sets the sky.** Sunrise at 6:30 and sunset at 7:00, the same hours the water already warms up. Stars and a moon at night.
- **The song sets the weather.** Energy drives wind, the same number the sea's swell uses. Low mood brings cloud, then rain, then a storm with a lightning strike every sixteen beats. A song with no sound data gets a plain gentle sky. While a song's sound is loading the sky keeps the last weather, so it doesn't clear and cloud over again.
- **The water matches.** The far water mirrors the horizon and the near water goes to its own color, always darker than the sky it meets. Home only uses this for its own water: the ocean underneath keeps its colors, and the splash covers the change.
- **The horizon.** Far water runs back 44 points behind the near wave, which stays exactly where it was so the bottle, the dive and the splash still line up.
- **The island.** Sits in the gap at the top of Home. The windsock fills with the song's energy. The sign swings and flips between tempo and key, the clues the card already shows; a new song spins it back to the tempo.
- **Words and buttons.** They flip between dark and light with the sky (`components/home/sky-ink.tsx`). Not DarkRoom, which would also flip the sheets that open from them. A soft haze sits behind the words only when the sky needs it, so they stay at 4.5:1 or better.
- **Tune → Test sky.** Look at dawn, noon, dusk or night without waiting. Not saved.

## Keeping it cheap on a phone

The clouds are the costly part, so the shader's canvas is 2.5x smaller than the screen and stretched, and it redraws about 20 times a second. Everything else on the sky updates about 30 times a second. All of it stops under the water and on other tabs. None of this has been measured on a phone yet: that's the first thing to check.

## Claude's calls

The colors, the weather formula, where the sun and moon travel, the island's look, and rounding the tab bar's lowest contrast (3.9:1 for under 1% of hour, water and weather combinations) rather than forcing a jump in the water's color.

## Phase 2: sea life (not built)

Seven animals at real distances from a camera 1.5 m above the water, so size and speed come from real meters: flying fish that passes in front of the buttons, small fish from dusk to dawn, an elephant seal, dolphins that roll by day and leap from dusk, a humpback that breaches more in wind, a sperm whale with its angled blow, a blue whale. They stay at the surface, so the user's "no wild creatures under water" still holds. Sightings should stay rare, about one every song or two.
