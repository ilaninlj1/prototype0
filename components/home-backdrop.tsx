import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/** Home's texture: a soft band of light where the card sits, and fine film grain over everything. */
export function HomeBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.background} stopOpacity={0} />
            <Stop offset="0.45" stopColor="#223566" stopOpacity={0.8} />
            <Stop offset="1" stopColor={Colors.background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      <Image source={require('@/assets/images/grain.png')} resizeMode="repeat" style={[StyleSheet.absoluteFill, styles.grain]} />
    </View>
  );
}

const styles = StyleSheet.create({ grain: { width: '100%', height: '100%', opacity: 0.9 } });
