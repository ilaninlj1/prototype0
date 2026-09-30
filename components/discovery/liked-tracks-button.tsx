import { TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Ui } from '@/constants/theme';

type LikedTracksButtonProps = {
  onPress: () => void;
};

/** A thin cream outline, matching Tune. */
export function LikedTracksButton({ onPress }: LikedTracksButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={Ui.outlineButton}>
      <ThemedText style={Ui.label}>Liked</ThemedText>
    </TouchableOpacity>
  );
}
