/**
 * Home's words sit straight on a sky that changes: clouds, a sunset, night. With the phone's Increase Contrast
 * setting on (High Contrast Text on Android), the words stop being see-through grey, the buttons get a solid
 * backing, and the words under the card get a panel behind them, so they read whatever the sky is doing.
 */
export type InkColors = { text: string; secondary: string; frost: string };

export type StrongInk = InkColors & { backing: string };

export function strongInk(ink: InkColors, wordsDark: boolean): StrongInk {
  return wordsDark
    ? { text: '#000000', secondary: '#000000', frost: 'rgba(255,255,255,0.94)', backing: 'rgba(255,255,255,0.88)' }
    : { text: '#ffffff', secondary: '#ffffff', frost: 'rgba(6,14,36,0.9)', backing: 'rgba(6,14,36,0.82)' };
}

/** How see-through a color is, 1 for solid. Hex colors are solid. */
export function alphaOf(color: string): number {
  const found = /rgba\([^)]*,\s*([0-9.]+)\s*\)/.exec(color);
  return found ? Number(found[1]) : 1;
}
