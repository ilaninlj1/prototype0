import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useDarkRoom } from '@/components/dark-room';
import { Colors, DarkTypography, fontFor, toDark, Typography } from '@/constants/theme';
import { WEB_TEXT_SCALE } from '@/hooks/use-text-scale';
import { drawnScale, TEXT_CAP, type TextRole } from '@/lib/text-scale';

export type ThemedTextProps = TextProps & {
  type?: keyof typeof Typography;
  /** How far the phone's text size setting may grow this text (lib/text-scale.ts). Reading text by default. */
  grows?: TextRole;
};

export function ThemedText({ style, type = 'default', grows = 'reading', maxFontSizeMultiplier, ...rest }: ThemedTextProps) {
  const dark = useDarkRoom();
  // A dark room keeps its mono eyebrows, and light tokens (from Typography or a shared style) become their navy-set twins.
  const flat: TextStyle = { ...StyleSheet.flatten([{ color: Colors.text }, (dark ? DarkTypography : Typography)[type], style]) };
  const color = dark ? toDark(flat.color) : flat.color;
  // A style that names a weight file (fontFamily 'Figtree_600SemiBold') without a fontWeight means that file,
  // not the type's default weight 400.
  const own = StyleSheet.flatten(style) ?? {};
  const weight = own.fontWeight ?? (own.fontFamily ? undefined : flat.fontWeight);
  const fontFamily = fontFor(flat.fontFamily, weight);
  const cap = maxFontSizeMultiplier ?? TEXT_CAP[grows];
  // The phone grows text by itself. The web has no such setting, so ?textScale= does the same sum by hand.
  const web = Platform.OS === 'web' && WEB_TEXT_SCALE !== 1 && rest.allowFontScaling !== false ? drawnScale(WEB_TEXT_SCALE, cap) : 1;
  const size = web === 1 ? null : { fontSize: (flat.fontSize ?? 14) * web, lineHeight: flat.lineHeight ? flat.lineHeight * web : undefined };
  return <Text maxFontSizeMultiplier={cap} style={[flat, { color, fontFamily, fontWeight: undefined }, size]} {...rest} />;
}
