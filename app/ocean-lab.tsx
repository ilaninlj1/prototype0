import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { lazySkia } from '@/components/print/lazy-skia';
import { DEPTHS, WATERS, type Depth, type Water } from '@/lib/ocean-map';
import { exampleInput } from '@/lib/ocean-example';
import { buildOcean } from '@/lib/ocean-person';
import { CALM_RHYTHM, restingSea } from '@/lib/sea-beat';

const OceanCanvas = lazySkia(() => import('@/components/ocean/ocean-canvas'));

// A place frozen in time, to judge the art: /ocean-lab?water=midnight&depth=gems&hour=2&person=example&t=30
export default function OceanLab() {
  const q = useLocalSearchParams<{ water?: string; depth?: string; hour?: string; person?: string; t?: string; dive?: string; surface?: string }>();
  const { width, height } = useWindowDimensions();
  const water = (WATERS.includes(q.water as Water) ? q.water : 'reef') as Water;
  const depth = (DEPTHS.includes(q.depth as Depth) ? q.depth : 'popular') as Depth;
  const hour = Number(q.hour ?? 13);
  const started = useMemo(() => Date.now(), []);
  const life = useMemo(() => (q.person === 'example' ? buildOcean(exampleInput(started)) : null), [q.person, started]);
  const surfaceY = Number(q.surface ?? height * 0.82);
  const dive = useSharedValue(Number(q.dive ?? 1));
  const sea = useSharedValue(restingSea(CALM_RHYTHM));
  const posX = useSharedValue(WATERS.indexOf(water));
  const posY = useSharedValue(DEPTHS.indexOf(depth));
  const clock = useSharedValue(Number(q.t ?? 20));
  const touch = useSharedValue<{ x: number; y: number; r: number } | null>(null);
  const spotlight = useSharedValue(0);
  return (
    <View style={styles.root}>
      <OceanCanvas
        width={width}
        height={height}
        dive={dive}
        travel={surfaceY + 34}
        surfaceY={surfaceY}
        sea={sea}
        posX={posX}
        posY={posY}
        clock={clock}
        touch={touch}
        spotlight={spotlight}
        rest={{ water: 'reef', depth: 'popular' }}
        hour={hour}
        life={life}
        bottles={[]}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#ffffff' } });
