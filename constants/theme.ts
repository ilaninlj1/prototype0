/**
 * Two fixed palettes, no system light/dark switching (Minimal UI, 2026-10-21).
 * `Colors` is the room: white, black text, light grey surfaces, black as the
 * only strong color. `DarkColors` is the old navy room, kept for the things
 * that are dark on purpose: the blind card (the sound print lives on navy),
 * the cards under it, and the full-screen experiences (Edition, Dark Map,
 * Rewind).
 */

export const Colors = {
  // White is the room; black carries text, symbols and the main button; one
  // red marks what matters (the heart, saves, streaks, big numbers). Red on
  // white is 4.0:1, fine for symbols and large text, so small text stays black.
  background: '#FFFFFF',
  surface: '#F2F2F2',
  surfaceElevated: '#FFFFFF',
  border: 'rgba(17, 17, 17, 0.08)',
  /** Thin outlines on buttons and cards. */
  hairline: 'rgba(17, 17, 17, 0.16)',
  /** Section rules (tab bar top, lists). */
  rule: 'rgba(17, 17, 17, 0.10)',

  text: '#111111',
  // 5.3:1 on white, 4.8:1 on the grey surface.
  textSecondary: '#6B6B6B',
  // The quietest text: 4.5:1 on white only, so never small on the grey surface.
  textTertiary: '#767676',

  // Buttons and selected states: black with white text (18.9:1).
  accent: '#111111',
  accentText: '#FFFFFF',

  signal: '#E63946',

  highlight: '#f4c542',

  // Darker than the signal so a small "Delete" or "+2%" still reads (5.6:1 and 5.3:1 on white).
  destructive: '#C62828',
  positive: '#1F7A4A',

  tint: '#111111',
  icon: '#6B6B6B',
};

export const DarkColors = {
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

const LIGHT_TO_DARK = new Map<string, string>(
  (Object.keys(Colors) as (keyof typeof Colors)[]).map((k) => [Colors[k], DarkColors[k]])
);

/** A light token's twin in the navy set (text → cream, surface → navy surface…); any other color passes through. */
export function toDark<T>(color: T): T | string {
  return typeof color === 'string' ? (LIGHT_TO_DARK.get(color) ?? color) : color;
}

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel(((n >> 16) & 255) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255);
};

/** WCAG contrast between two #rrggbb colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Soft corners for the light app (Minimal UI): thumbnails and small boxes `sm`,
// tiles `md`, cards `lg`, chips `pill`; `round` is for real circles. Home's card,
// the sheets and the big cards use 28. The dark rooms keep their own numbers.
export const Radius = {
  sm: 6,
  md: 12,
  lg: 16,
  pill: 18,
  round: 999,
};

// Archivo for display (heavy but plain enough to read at a glance), Figtree
// for text, DM Mono for numbers. Loaded in
// app/_layout.tsx; ThemedText picks the right weight file (see fontFor).
export const Fonts = {
  display: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  sans: 'Figtree_400Regular',
  sansSemiBold: 'Figtree_600SemiBold',
  sansBold: 'Figtree_700Bold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
  // Handwritten touches, used sparingly: stickers and margin notes.
  marker: 'PermanentMarker_400Regular',
  note: 'Caveat_700Bold',
  // The Edition reel's type, from claude-motion-reel.html.
  reel: 'InterTight_900Black',
  reelBold: 'InterTight_700Bold',
  reelScript: 'Parisienne_400Regular',
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

// The old label: small tracked-out uppercase mono, like a record's catalog
// line. Only the dark rooms (Edition, Dark Map, Rewind) still use it.
const MONO_LABEL = {
  fontFamily: Fonts.monoMedium,
  fontSize: 12,
  lineHeight: 16,
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
};

// Type with a point of view: heavy Archivo for anything you should read
// first; a small grey sentence-case line above it; Figtree for everything you
// read after. DM Mono is for numbers.
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
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
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

/** Typography inside a dark room: the same styles, with the old mono eyebrow. ThemedText maps the colors. */
export const DarkTypography = { ...Typography, eyebrow: { ...MONO_LABEL, color: Colors.textSecondary } };

/**
 * Controls shared across light screens: plain text, or a pill with a thin
 * outline (fill it black for the one main action on a screen).
 */
export const Ui = {
  textButton: { minHeight: TapTarget, minWidth: TapTarget, justifyContent: 'center' as const },
  outlineButton: {
    minHeight: TapTarget,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: TapTarget / 2,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  /** Text fields: a thin outline, no fill. */
  input: {
    minHeight: TapTarget,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    color: Colors.text,
    fontFamily: Fonts.sans,
    fontSize: 16,
  },
  /** Sentence-case Figtree, for button labels and section labels. */
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 18, color: Colors.text },
};

// The dark rooms keep the controls they were designed with: square-ish outlines and mono uppercase labels.
const MONO_UI = {
  textButton: Ui.textButton,
  outlineButton: { ...Ui.outlineButton, paddingHorizontal: Spacing.md, borderRadius: Radius.sm },
  input: Ui.input,
  label: { ...MONO_LABEL, color: Colors.text },
};

const darkenStyle = <T extends object>(style: T): T =>
  Object.fromEntries(Object.entries(style).map(([k, v]) => [k, typeof v === 'string' ? toDark(v) : v])) as T;

/** Ui for the dark rooms (Edition, Dark Map, Rewind): their own controls, with navy-set colors. */
export const DarkUi = Object.fromEntries(Object.entries(MONO_UI).map(([k, v]) => [k, darkenStyle(v)])) as typeof MONO_UI;
