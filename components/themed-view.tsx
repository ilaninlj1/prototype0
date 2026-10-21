import { View, type ViewProps } from 'react-native';

import { useDarkRoom } from '@/components/dark-room';
import { Colors, toDark } from '@/constants/theme';

export type ThemedViewProps = ViewProps & {
  /** Defaults to the app background; pass `'transparent'` or a surface token explicitly when needed. */
  backgroundColor?: string;
};

export function ThemedView({ style, backgroundColor = Colors.background, ...otherProps }: ThemedViewProps) {
  const dark = useDarkRoom();
  return <View style={[{ backgroundColor: dark ? toDark(backgroundColor) : backgroundColor }, style]} {...otherProps} />;
}
