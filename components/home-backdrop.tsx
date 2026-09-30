import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/** Home's texture: a soft glow where the card sits, and fine film grain over everything. */
export function HomeBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="45%" rx="75%" ry="55%">
            <Stop offset="0" stopColor="#24386a" stopOpacity={0.9} />
            <Stop offset="1" stopColor={Colors.background} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      <Image source={require('@/assets/images/grain.png')} resizeMode="repeat" style={[StyleSheet.absoluteFill, styles.grain]} />
    </View>
  );
}

const styles = StyleSheet.create({ grain: { width: '100%', height: '100%', opacity: 0.9 } });
