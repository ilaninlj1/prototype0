import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useDarkRoom } from '@/components/dark-room';
import { Colors, DarkTypography, fontFor, toDark, Typography } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: keyof typeof Typography;
};

export function ThemedText({ style, type = 'default', ...rest }: ThemedTextProps) {
  const dark = useDarkRoom();
  // A dark room keeps its mono eyebrows, and light tokens (from Typography or a shared style) become their navy-set twins.
  const flat: TextStyle = { ...StyleSheet.flatten([{ color: Colors.text }, (dark ? DarkTypography : Typography)[type], style]) };
  const color = dark ? toDark(flat.color) : flat.color;
  // A style that names a weight file (fontFamily 'Figtree_600SemiBold') without a fontWeight means that file,
  // not the type's default weight 400.
  const own = StyleSheet.flatten(style) ?? {};
  const weight = own.fontWeight ?? (own.fontFamily ? undefined : flat.fontWeight);
  const fontFamily = fontFor(flat.fontFamily, weight);
  return <Text style={[flat, { color, fontFamily, fontWeight: undefined }]} {...rest} />;
}
