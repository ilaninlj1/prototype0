/**
 * Dark-only design system. Album artwork is the app's real visual content and
 * reads best against a near-black backdrop, and every custom surface built
 * this far had already drifted toward hardcoded dark colors regardless of the
 * system light/dark toggle — one deliberate palette instead of an adaptive
 * one nobody was actually using.
 */

import { Platform } from 'react-native';

export const Colors = {
  background: '#0d0d0f',
  surface: '#1a1a1e',
  surfaceElevated: '#26262b',
  border: 'rgba(255, 255, 255, 0.08)',

  text: '#f2f2f4',
  textSecondary: 'rgba(242, 242, 244, 0.62)',
  textTertiary: 'rgba(242, 242, 244, 0.38)',

  // One accent for everything that used to fight over green/blue/teal
  // (Explore, selected/checkmarked states, the current-genre highlight).
  accent: '#8b5cf6',
  accentText: '#ffffff',

  // One destructive red, replacing the two slightly different ones that had
  // accumulated (an error banner's red and a delete action's red).
  destructive: '#ef4444',

  tint: '#8b5cf6',
  icon: 'rgba(242, 242, 244, 0.62)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
})!;

// `rounded` only resolves to something distinctive on iOS and web — Android's
// `default` branch falls back to the plain system sans. Known, accepted gap
// rather than pulling in a cross-platform font package to paper over it.
export const Typography = {
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    fontWeight: '700' as const,
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: Fonts.rounded,
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 26,
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
    color: Colors.accent,
  },
  label: {
    fontFamily: Fonts.rounded,
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
