import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useDarkRoom } from '@/components/dark-room';
import { Colors, fontFor, toDark, Typography } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: keyof typeof Typography;
};

export function ThemedText({ style, type = 'default', ...rest }: ThemedTextProps) {
  const dark = useDarkRoom();
  const flat: TextStyle = { ...StyleSheet.flatten([{ color: Colors.text }, Typography[type], style]) };
  // In a dark room, light tokens (from Typography or a shared style) become their navy-set twins.
  const color = dark ? toDark(flat.color) : flat.color;
  const fontFamily = fontFor(flat.fontFamily, flat.fontWeight);
  return <Text style={[flat, { color, fontFamily, fontWeight: undefined }]} {...rest} />;
}
