import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Colors, fontFor, Typography } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: keyof typeof Typography;
};

export function ThemedText({ style, type = 'default', ...rest }: ThemedTextProps) {
  const flat: TextStyle = StyleSheet.flatten([{ color: Colors.text }, Typography[type], style]);
  const fontFamily = fontFor(flat.fontFamily, flat.fontWeight);
  return <Text style={[flat, { fontFamily, fontWeight: undefined }]} {...rest} />;
}
