import { TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Ui } from '@/constants/theme';

/** Opens the Dark Map and shows how much of it you've lit. A thin cream outline, matching Tune and Liked. */
export function MapButton({ share, onPress }: { share: number | null; onPress: () => void }) {
  const pct = share == null ? null : Math.round(share * 100);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={Ui.outlineButton}
      accessibilityRole="button"
      accessibilityLabel={pct == null ? 'Dark map' : `Dark map, ${pct} percent lit`}>
      <ThemedText style={Ui.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {pct == null ? 'Map' : `Map · ${pct}%`}
      </ThemedText>
    </TouchableOpacity>
  );
}
