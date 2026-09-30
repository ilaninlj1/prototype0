import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';

/**
 * A hand-placed note: marker lettering on a gold scrap, stuck on a little
 * crooked, with a scribbled arrow. Meant to look put there by a person.
 */
export function Sticker({ label, tilt = -6 }: { label: string; tilt?: number }) {
  return (
    <View style={[styles.wrap, { transform: [{ rotate: `${tilt}deg` }] }]} pointerEvents="none">
      <View style={styles.scrap}>
        <ThemedText style={styles.text}>{label}</ThemedText>
      </View>
      {/* A quick pen stroke, slightly uneven on purpose. */}
      <Svg width={34} height={26} viewBox="0 0 34 26" style={styles.arrow}>
        <Path
          d="M31 3 C 24 5, 14 9, 6 19 M6 19 L 7.5 11.5 M6 19 L 13.5 17.8"
          stroke={Colors.highlight}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end' },
  scrap: {
    backgroundColor: Colors.highlight,
    paddingHorizontal: 10,
    paddingTop: 3,
    paddingBottom: 1,
    // Uneven corners, like torn tape.
    borderTopLeftRadius: 2,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 1,
  },
  text: { fontFamily: Fonts.marker, fontSize: 15, lineHeight: 21, color: Colors.accentText },
  arrow: { marginTop: 2, marginRight: 30 },
});
