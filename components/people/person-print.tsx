import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottlePrint } from '@/components/bottles/bottle-print';
import { DarkColors } from '@/constants/theme';
import type { Hop, RingSeed } from '@/lib/bottle-rows';

/**
 * A person, here: never a face. The middle is a song you share; the rings are their own
 * recent hearts, in the shape Bottles draws its keepers (lib/bottle-print.ts). Round on the
 * one dark thing on a light screen.
 */
export function PersonPrint({ trackId, rings, size }: { trackId: number; rings: RingSeed[]; size: number }) {
  const hops = useMemo(
    () =>
      rings.map(
        (ring): Hop => ({ kind: 'keep', city: '', country: '', lat: 0, lng: 0, exact: false, tier: null, ring, at: '' })
      ),
    [rings]
  );
  return (
    <View style={[styles.round, { width: size, height: size, borderRadius: size / 2 }]}>
      <BottlePrint trackId={trackId} hops={hops} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  round: { overflow: 'hidden', backgroundColor: DarkColors.background },
});
