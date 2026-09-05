import { View, type ViewProps } from 'react-native';

import { Colors } from '@/constants/theme';

export type ThemedViewProps = ViewProps & {
  /** Defaults to the app background; pass `'transparent'` or a surface token explicitly when needed. */
  backgroundColor?: string;
};

export function ThemedView({ style, backgroundColor = Colors.background, ...otherProps }: ThemedViewProps) {
  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
