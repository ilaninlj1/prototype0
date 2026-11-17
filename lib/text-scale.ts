/**
 * How far the phone's text size setting may grow each kind of text.
 * iPhone's biggest setting (Accessibility > Larger Text, all the way up) asks for about 3.1x.
 * Reading text follows it up to 1.75x and wraps onto more lines. Small labels on fixed controls
 * (the tab bar, the round buttons) stop sooner, because they have nowhere to wrap to;
 * those controls say their name through the screen reader and the large content viewer instead.
 */
export const TEXT_CAP = { reading: 1.75, label: 1.3, chrome: 1.25 } as const;

export type TextRole = keyof typeof TEXT_CAP;

/** The scale text is actually drawn at: the phone's setting, held at the cap. Never below 1 from a bad value. */
export function drawnScale(fontScale: number, cap: number = TEXT_CAP.reading): number {
  if (!Number.isFinite(fontScale) || fontScale <= 0) return 1;
  return Math.min(fontScale, cap);
}

/** A size that must grow in step with text beside it (an icon, a row height). */
export function scaled(size: number, fontScale: number, cap: number = TEXT_CAP.reading): number {
  return Math.round(size * drawnScale(fontScale, cap));
}

/** True once text is big enough that side-by-side things should stack. */
export function isBigText(fontScale: number): boolean {
  return drawnScale(fontScale) >= 1.5;
}

/** The web has no text size setting, so a page can ask for one with ?textScale=3.1 to check layouts. */
export function textScaleFromQuery(search: string | undefined): number {
  const found = /[?&]textScale=([0-9.]+)/.exec(search ?? '');
  const value = found ? Number(found[1]) : 1;
  return Number.isFinite(value) && value >= 0.5 && value <= 4 ? value : 1;
}
