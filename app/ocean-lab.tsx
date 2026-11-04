import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { JourneySheet } from '@/components/bottles/journey-sheet';
import { lazySkia } from '@/components/print/lazy-skia';
import type { Bottle } from '@/lib/bottle-rows';
import { DEPTHS, WATERS, type Depth, type Water } from '@/lib/ocean-map';
import { exampleInput } from '@/lib/ocean-example';
import { buildOcean } from '@/lib/ocean-person';
import { NO_SPLASH } from '@/lib/ocean-splash';
import { CALM_RHYTHM, restingSea } from '@/lib/sea-beat';

// Made up, to judge the note a bottle opens to: /ocean-lab?note=1
const hop = (kind: 'launch' | 'keep', city: string, country: string, lat: number, lng: number, at: string) => ({ kind, city, country, lat, lng, exact: true, tier: null, ring: null, at });
const LAB_NOTE = {
  id: 'lab',
  trackId: 1,
  artistKey: 'lab',
  genreTag: 'lab',
  keeps: 2,
  passes: 1,
  state: 'floating',
  lastMovedAt: '2026-10-20T12:00:00Z',
  changedAt: '2026-10-20T12:00:00Z',
  hops: [hop('launch', 'Dallas', 'US', 32.8, -96.8, '2026-10-02T12:00:00Z'), hop('keep', 'Lisbon', 'PT', 38.7, -9.1, '2026-10-11T12:00:00Z'), hop('keep', 'Osaka', 'JP', 34.7, 135.5, '2026-10-20T12:00:00Z')],
} as unknown as Bottle;

const LAB_BOTTLES = ['#e99854', '#4fa8d8', '#d86f6f', '#7fc98f', '#e8c95a'].flatMap((color, i) => WATERS.map((water) => ({ id: `${water}${i}`, trackId: i, place: { water, depth: 'popular' as const }, color, seed: i * 7 + 1 })));

const OceanCanvas = lazySkia(() => import('@/components/ocean/ocean-canvas'));

// A place frozen in time, to judge the art: /ocean-lab?water=midnight&depth=gems&hour=2&person=example&t=30
export default function OceanLab() {
  const q = useLocalSearchParams<{ water?: string; depth?: string; hour?: string; person?: string; t?: string; dive?: string; surface?: string; note?: string }>();
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
  const touchPower = useSharedValue(0);
  const spotlight = useSharedValue(0);
  const song = useSharedValue<{ tempo: number; key: number } | null>(null);
  const drawMs = useSharedValue(0);
  const splash = useSharedValue(NO_SPLASH);
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
        touchPower={touchPower}
        spotlight={spotlight}
        song={song}
        drawMs={drawMs}
        splash={splash}
        place={{ water, depth }}
        rest={{ water: 'reef', depth: 'popular' }}
        hour={hour}
        life={life}
        bottles={q.person === 'example' ? LAB_BOTTLES : []}
      />
      {q.note === '1' && <JourneySheet bottle={LAB_NOTE} title="The note inside" note onClose={() => {}} />}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#ffffff' } });
