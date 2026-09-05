import { Text, type TextProps } from 'react-native';

import { Colors, Typography } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: keyof typeof Typography;
};

export function ThemedText({ style, type = 'default', ...rest }: ThemedTextProps) {
  return <Text style={[{ color: Colors.text }, Typography[type], style]} {...rest} />;
}
