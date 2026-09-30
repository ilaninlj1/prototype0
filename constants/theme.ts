/**
 * Dark-only design system. Album artwork is the app's real visual content and
 * reads best against a near-black backdrop, and every custom surface built
 * this far had already drifted toward hardcoded dark colors regardless of the
 * system light/dark toggle — one deliberate palette instead of an adaptive
 * one nobody was actually using.
 */


export const Colors = {
  // Navy is the room; cream carries text and every symbol's line; one red
  // marks what matters. Imperial red on navy is a classic pairing and passes
  // 3:1 for symbols and large text (3.8:1), so small text stays cream.
  background: '#13213f',
  surface: '#1b2c52',
  surfaceElevated: '#26396a',
  border: 'rgba(243, 234, 216, 0.10)',
  /** Thin cream outlines on buttons and the revealed card. */
  hairline: 'rgba(243, 234, 216, 0.28)',
  /** Section rules (tab bar top, the collage). */
  rule: 'rgba(243, 234, 216, 0.14)',

  text: '#f3ead8',
  textSecondary: 'rgba(243, 234, 216, 0.68)',
  textTertiary: 'rgba(243, 234, 216, 0.42)',

  // Buttons and selected states: cream with navy text (13:1).
  accent: '#f3ead8',
  accentText: '#13213f',

  // The one sharp color: symbols, the heart, streaks, big numbers.
  signal: '#e63946',

  // Rare third color for hand-placed notes (the Recommended sticker). Navy,
  // red and gold is a classic trio; navy text on it is 9.8:1.
  highlight: '#f4c542',

  destructive: '#e63946',
  positive: '#6cc38a',

  tint: '#f3ead8',
  icon: 'rgba(243, 234, 216, 0.68)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// One small radius family used sparingly; `pill` is now a soft rectangle for
// buttons and chips, and `round` is for things that really are circles.
export const Radius = {
  sm: 4,
  md: 6,
  lg: 10,
  pill: 8,
  round: 999,
};

// Archivo for display (heavy but plain enough to read at a glance), Figtree
// for text, DM Mono for numbers. Loaded in
// app/_layout.tsx; ThemedText picks the right weight file (see fontFor).
export const Fonts = {
  display: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  sans: 'Figtree_400Regular',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
  // Handwritten touches, used sparingly: stickers and margin notes.
  marker: 'PermanentMarker_400Regular',
  note: 'Caveat_700Bold',
};

const FIGTREE: Record<string, string> = {
  '400': 'Figtree_400Regular',
  '500': 'Figtree_500Medium',
  '600': 'Figtree_600SemiBold',
  '700': 'Figtree_700Bold',
  '800': 'Figtree_800ExtraBold',
};

/** Custom fonts ship one file per weight, so a fontWeight has to become a family name. */
export function fontFor(family: string | undefined, weight: string | number | undefined): string | undefined {
  if (!weight || !family?.startsWith('Figtree')) return family;
  return FIGTREE[String(weight)] ?? (Number(weight) >= 700 ? FIGTREE['700'] : family);
}

// Type with a point of view: heavy Archivo for anything you should read
// first; small tracked-out mono "eyebrows" above it, like a label's catalog
// line; Figtree for everything you read after.
export const Typography = {
  hero: {
    fontFamily: Fonts.display,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  eyebrow: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: Colors.textSecondary,
  },
  number: {
    fontFamily: Fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums' as const],
    color: Colors.signal,
  },
  defaultSemiBold: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  default: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  link: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '500' as const,
    lineHeight: 20,
    color: Colors.text,
    textDecorationLine: 'underline' as const,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  caption: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 17,
    color: Colors.textSecondary,
  },
};

/** Smallest comfortable tap target, even when the visual is smaller. */
export const TapTarget = 44;

/**
 * Flat controls shared across screens: plain text or a thin cream outline,
 * never a filled rounded pill.
 */
export const Ui = {
  textButton: { minHeight: TapTarget, minWidth: TapTarget, justifyContent: 'center' as const },
  outlineButton: {
    minHeight: TapTarget,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  /** Mono uppercase, for button labels and section labels. */
  label: { fontFamily: Fonts.monoMedium, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: 'uppercase' as const, color: Colors.text },
};
