import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import type { SeaSlot } from '@/hooks/use-sea-life';
import type { Ink, Scene } from '@/lib/sea-life';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Slot = keyof Ink;
type Paint = { fill?: string; fillOpacity?: number; stroke?: string; strokeOpacity?: number; strokeWidth?: number };

function InkPath({ scene, layer, slot, ...paint }: { scene: SharedValue<Scene>; layer: 0 | 1 | 2; slot: Slot } & Paint) {
  const props = useAnimatedProps(() => ({ d: scene.get().layers[layer][slot] || 'M0 0' }));
  return <AnimatedPath animatedProps={props} {...paint} fill={paint.fill ?? 'none'} strokeLinecap="round" />;
}

function GlassPath({ scene, slot, ...paint }: { scene: SharedValue<Scene>; slot: 'glassFill' | 'glassRim' | 'glassDot' | 'glassTrail' } & Paint) {
  const props = useAnimatedProps(() => ({ d: scene.get()[slot] || 'M0 0' }));
  return <AnimatedPath animatedProps={props} {...paint} fill={paint.fill ?? 'none'} strokeLinecap="round" />;
}

const USED = { 0: ['hump', 'blue', 'sperm', 'pod', 'fly'], 1: ['seal', 'bait', 'fly'], 2: ['fly'] };

/**
 * The animals, in one of three layers: 0 behind the near wave, 1 in front of it, 2 in front of Home's buttons. Each is a
 * small strip that only exists while something is up, so a quiet sea costs nothing.
 */
export function SeaLifeLayer({ life, layer, width, top, height }: { life: SeaSlot; layer: 0 | 1 | 2; width: number; top: number; height: number }) {
  const { sighting, colors, scene } = life;
  const fade = useAnimatedStyle(() => ({ opacity: layer === 2 ? scene.get().fade : 1 }));
  if (!sighting || !colors || !USED[layer].includes(sighting.kind)) return null;
  const p = { scene, layer };
  return (
    <>
      <Animated.View style={[{ position: 'absolute', left: 0, top }, fade]} pointerEvents="none">
        <Svg width={width} height={height} viewBox={`0 ${top} ${width} ${height}`}>
          {layer < 2 && <InkPath {...p} slot="ring" stroke="#ffffff" strokeOpacity={0.32} strokeWidth={0.9} />}
          {layer < 2 && <InkPath {...p} slot="ghost" fill={colors.back} fillOpacity={0.13} />}
          {sighting.kind === 'fly' && <InkPath {...p} slot="wing" fill={colors.wing} fillOpacity={0.72} />}
          <InkPath {...p} slot="back" fill={colors.back} />
          <InkPath {...p} slot="belly" fill={colors.belly} />
          {(sighting.kind === 'seal' || sighting.kind === 'fly') && <InkPath {...p} slot="pupil" fill={colors.pupil} />}
          {sighting.kind === 'fly' && layer === 2 && <InkPath {...p} slot="eye" fill="#ffffff" />}
          {sighting.kind === 'fly' && layer === 2 && <InkPath {...p} slot="pupil" fill={colors.pupil} />}
          {layer < 2 && <InkPath {...p} slot="line" stroke={sighting.kind === 'bait' ? colors.back : '#ffffff'} strokeOpacity={sighting.kind === 'bait' ? 1 : 0.45} strokeWidth={sighting.kind === 'bait' ? 1.6 : 0.8} />}
          {layer < 2 && <InkPath {...p} slot="shade" fill={colors.shade} fillOpacity={0.12} />}
          {layer < 2 && <InkPath {...p} slot="puffC" fill={colors.puff} fillOpacity={0.18} />}
          {layer < 2 && <InkPath {...p} slot="puffB" fill={colors.puff} fillOpacity={0.4} />}
          {layer < 2 && <InkPath {...p} slot="puffA" fill={colors.puff} fillOpacity={0.66} />}
          {layer < 2 && <InkPath {...p} slot="drop" fill={colors.drop} fillOpacity={0.9} />}
        </Svg>
      </Animated.View>
      {layer === 2 && (
        <View style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          {/* The same drops as coming back up from a dive (components/ocean/ocean-draw.ts drawGlass). */}
          <Svg width={width} height={sighting.screenH}>
            <GlassPath scene={scene} slot="glassTrail" stroke="#96d6e2" strokeOpacity={0.3} strokeWidth={1.2} />
            <GlassPath scene={scene} slot="glassFill" fill="#78c8d8" fillOpacity={0.38} />
            <GlassPath scene={scene} slot="glassRim" stroke="#ffffff" strokeOpacity={0.65} strokeWidth={0.8} />
            <GlassPath scene={scene} slot="glassDot" fill="#ffffff" fillOpacity={0.85} />
          </Svg>
        </View>
      )}
    </>
  );
}
