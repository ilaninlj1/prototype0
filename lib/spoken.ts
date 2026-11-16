/**
 * What Home says out loud through VoiceOver or TalkBack. The screen changes without anything being tapped
 * (a new song starts, a song is revealed), and a screen reader only reads what you touch, so these are spoken.
 */

/** "104 BPM · E minor · Close to home" the way a voice should read it. */
export function spokenClues(clues: string | null): string {
  if (!clues) return '';
  return clues
    .replace(/\bBPM\b/g, 'beats per minute')
    .replace(/\b([A-G])#/g, '$1 sharp')
    .replace(/\b([A-G])b\b/g, '$1 flat')
    .split(' · ')
    .join(', ');
}

/** A new song at the top, still blind. */
export function spokenNewSong(place: string, clues: string | null): string {
  const sound = spokenClues(clues);
  return sound ? `New song, playing blind. ${place}. ${sound}.` : `New song, playing blind. ${place}.`;
}

/** The reveal: who it is, and how well known. */
export function spokenReveal(trackName: string, artistName: string, listeners?: string | null): string {
  const who = `Revealed: ${trackName} by ${artistName}.`;
  return listeners ? `${who} ${listeners} listeners.` : who;
}

/** The card's own label: what it is, then what you can do with it. */
export function cardLabel(revealed: boolean, trackName: string, artistName: string): string {
  return revealed ? `${trackName} by ${artistName}` : 'A song, playing blind';
}

export type CardAction = 'more' | 'skip' | 'jump' | 'save' | 'details' | 'next';

/** The card's actions in the screen reader's Actions menu, the same ones as the swipes. */
export function cardActions(revealed: boolean, saved: boolean): { name: CardAction; label: string }[] {
  if (revealed) {
    return [
      { name: 'next', label: 'Next song' },
      { name: 'save', label: saved ? 'Remove from saved' : 'Save this song' },
      { name: 'details', label: 'Song details' },
      { name: 'jump', label: 'Jump to a new genre' },
    ];
  }
  return [
    { name: 'more', label: 'More like this, and show who it is' },
    { name: 'skip', label: 'Skip this song' },
    { name: 'jump', label: 'Jump to a new genre' },
  ];
}
