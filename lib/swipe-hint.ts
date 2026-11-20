// The one hint a first-time visitor gets on Home: a fingertip sliding right across the blind card, and the words under
// it saying what that does. It goes for good after the first swipe; Tune → More brings it back for the next person.

/** What's stored: done after a first swipe, armed by Tune for the next person, nothing on a fresh start. */
export type HintStored = 'done' | 'armed' | null;
export const HINT_KEY = 'blindspotDiscovery:swipeHint';

/** Seconds into the song before the finger shows: long enough to hear it, not so long they give up. */
export const HINT_AFTER_S = 3;
export const HINT_WORDS = 'Swipe right to see who it is.';

/** Someone who has already swiped knows how; only a fresh start, or a reset for the next person, gets the hint. */
export function hintWanted(stored: HintStored, swipes: number): boolean {
  if (stored === 'armed') return true;
  if (stored === 'done') return false;
  return swipes === 0;
}

/** On the blind top card, once the song has played a few seconds (`position` is the clip's, in seconds). */
export function hintShowing(o: { wanted: boolean; hasCard: boolean; revealed: boolean; position: number }): boolean {
  return o.wanted && o.hasCard && !o.revealed && o.position >= HINT_AFTER_S;
}
