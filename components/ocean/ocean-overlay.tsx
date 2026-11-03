import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { oceanDive, oceanReduced, oceanTravel, onDiveSettled, settleDiveTo, useDivePan } from '@/components/ocean/dive-gesture';
import { OceanUi } from '@/components/ocean/ocean-ui';
import { lazySkia } from '@/components/print/lazy-skia';
import { useScreenReader } from '@/hooks/use-screen-reader';
import { castFor, type CastMember } from '@/lib/ocean-cast';
import { depthDragResult, nearestPlaceIndex, settleDive, showsAt, waterDragResult } from '@/lib/ocean-dive';
import { hitMember } from '@/lib/ocean-hit';
import { DEPTHS, SPECIES_INFO, WATERS, WATER_INFO, placeKey, placeLabel, type Depth, type Place, type Species, type Water } from '@/lib/ocean-map';
import { restPose, swimPose } from '@/lib/ocean-motion';
import type { Creature, OceanLife } from '@/lib/ocean-person';
import { seabedAt } from '@/lib/ocean-scene';
import type { OceanBottle } from '@/components/ocean/ocean-canvas';
import type { SeaState } from '@/lib/sea-beat';

const OceanCanvas = lazySkia(() => import('./ocean-canvas'));

const PLACE_KEY = 'blindspotDiscovery:oceanPlace';
const HINT_KEY = 'blindspotDiscovery:oceanHintSeen';
/** Everything below this on the phone's surface is left to the water, so the surface can leave the screen fully. */
const CLEARANCE = 34;
const SPRING = { damping: 24, stiffness: 150, mass: 0.9, overshootClamping: true };

export type OceanFilter = { place: Place; species: Species | null };

export function OceanOverlay({
  sea,
  width,
  height,
  surfaceY,
  floor,
  focused,
  rest,
  hour,
  life,
  bottles,
  spotlight,
  activePlace,
  jump,
  notice,
  songsLeft,
  onSwipeHere,
  onWake,
  onUnderChange,
  onPlaceChange,
  onTapCreature,
  onTapBottle,
  onPortrait,
  onOpenList,
}: {
  sea: SharedValue<SeaState>;
  width: number;
  height: number;
  surfaceY: number;
  /** The tab bar's height: the strip of water the bar floats on. */
  floor: number;
  focused: boolean;
  /** Where Home's water is from: Sunny reef / Popular, or the active filter's place. */
  rest: Place;
  hour: number;
  life: OceanLife | null;
  bottles: OceanBottle[];
  /** The track whose creature lights up and comes forward while your songs play, or 0. */
  spotlight: SharedValue<number>;
  /** The place an ocean filter is on, so you arrive there. */
  activePlace: Place | null;
  /** A request to go under, to a place: from Details, the Library or You. */
  jump: { place: Place; key: number } | null;
  /** A line under the pill, when this isn't your own ocean. */
  notice: string | null;
  songsLeft: (place: Place, species: Species | null) => number;
  onSwipeHere: (filter: OceanFilter) => void;
  onWake: () => void;
  onUnderChange: (under: boolean) => void;
  onPlaceChange: (place: Place) => void;
  onTapCreature: (creature: Creature) => void;
  onTapBottle: (bottle: OceanBottle) => void;
  onPortrait: () => void;
  onOpenList: (place: Place) => void;
}) {
  const reduced = useReducedMotion();
  const screenReader = useScreenReader();
  useEffect(() => oceanReduced.set(!!reduced || screenReader), [reduced, screenReader]);
  useEffect(() => {
    oceanTravel.set(surfaceY + CLEARANCE);
  }, [surfaceY]);

  const [ready, setReady] = useState(false);
  const [under, setUnder] = useState(false);
  const [place, setPlace] = useState<Place>({ water: 'reef', depth: 'popular' });
  const [species, setSpecies] = useState<Species | null>(null);
  const [hintSeen, setHintSeen] = useState(true);
  const [wildLine, setWildLine] = useState<string | null>(null);
  const posX = useSharedValue(0);
  const posY = useSharedValue(0);
  const clock = useSharedValue(0);
  const touch = useSharedValue<{ x: number; y: number; r: number } | null>(null);
  const running = useSharedValue(false);
  // With reduced motion the scene doesn't rise with the finger: it's already in place, and only fades in.
  const stillDive = useSharedValue(1);

  // The scene only loads once Home has settled, so Home's first moments stay quick.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const jumpTo = useCallback(
    (next: Place, animated: boolean) => {
      const x = WATERS.indexOf(next.water);
      const y = DEPTHS.indexOf(next.depth);
      posX.set(animated && !reduced ? withSpring(x, SPRING) : x);
      posY.set(animated && !reduced ? withSpring(y, SPRING) : y);
      setPlace(next);
      onPlaceChange(next);
      void AsyncStorage.setItem(PLACE_KEY, JSON.stringify(next)).catch(() => {});
    },
    [posX, posY, reduced, onPlaceChange]
  );

  // You arrive where you last were, or the first time, on Sunny reef / Popular.
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(PLACE_KEY)
      .then((raw) => {
        if (!live || !raw) return;
        const stored = JSON.parse(raw) as Place;
        if (WATERS.includes(stored.water) && DEPTHS.includes(stored.depth)) jumpTo(stored, false);
      })
      .catch(() => {});
    AsyncStorage.getItem(HINT_KEY)
      .then((raw) => {
        if (live) setHintSeen(raw === '1');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A filter that's on decides where you arrive.
  const activeKey = activePlace ? placeKey(activePlace) : null;
  useEffect(() => {
    if (activePlace) jumpTo(activePlace, false);
    // By value: a new object for the same place is no move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    if (!jump) return;
    jumpTo(jump.place, false);
    settleDiveTo(1);
    // Once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.key]);

  useEffect(
    () =>
      onDiveSettled((nowUnder) => {
        setUnder(nowUnder);
        onUnderChange(nowUnder);
      }),
    [onUnderChange]
  );

  // Leaving Home always puts you back at the surface, so no other tab ever finds it half slid.
  useEffect(() => {
    running.set(focused);
    if (!focused && oceanDive.get() > 0) {
      oceanDive.set(0);
      setUnder(false);
      onUnderChange(false);
    }
  }, [focused, running, onUnderChange]);

  useEffect(() => {
    if (!under) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      settleDiveTo(0);
      return true;
    });
    return () => sub.remove();
  }, [under]);

  useFrameCallback((f) => {
    if (reduced || !running.get() || oceanDive.get() <= 0) return;
    clock.set(clock.get() + Math.min(64, f.timeSincePreviousFrame ?? 16) / 1000);
  });

  const member = useMemo(() => castFor(place, life, hour), [place, life, hour]);
  const hiddenHere = member.hiddenCount;

  function settledAt(waterIndex: number, depthIndex: number) {
    const next = { water: WATERS[waterIndex], depth: DEPTHS[depthIndex] };
    if (placeKey(next) === placeKey(place)) return;
    setSpecies(null);
    setWildLine(null);
    jumpTo(next, false);
  }

  const tapAt = (x: number, y: number) => {
    const t = clock.get();
    const poses = member.members.map((m: CastMember) => swimPose(m, t, width, height));
    const i = hitMember(x, y, member.members, poses);
    if (i != null) {
      const m = member.members[i];
      if (m.creature) return onTapCreature(m.creature);
      const picked = m.wild?.species ?? null;
      if (picked) setSpecies((now) => (now === picked ? null : picked));
      setWildLine(picked ? `A wild one, not your song. ${SPECIES_INFO[picked].means} songs live here too.` : 'A wild one, not your song.');
      void AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
      setHintSeen(true);
      return;
    }
    // A bottle resting on the sand.
    const here = bottles.filter((b) => placeKey(b.place) === placeKey(place));
    const row = DEPTHS.indexOf(place.depth);
    for (let b = 0; b < here.length; b++) {
      const rest = restPose(here[b].seed, b, here.length, width, height * 0.86);
      const fx = Math.max(0, Math.min(1, rest.x / width));
      if (Math.hypot(rest.x - x, height - seabedAt(row, fx) * height - 4 - y) < 30) return onTapBottle(here[b]);
    }
    setSpecies(null);
    setWildLine(null);
  };

  // One finger: sideways changes water, up sinks, down rises, and down from Popular brings you to the surface.
  const axis = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const rising = useSharedValue(false);
  const swim = Gesture.Pan()
    .minDistance(12)
    .onBegin((e) => {
      touch.set({ x: e.x, y: e.y, r: 90 });
    })
    .onStart((e) => {
      axis.set(Math.abs(e.translationX) > Math.abs(e.translationY) ? 1 : 2);
      startX.set(nearestPlaceIndex(posX.get()));
      startY.set(nearestPlaceIndex(posY.get()));
      rising.set(false);
    })
    .onUpdate((e) => {
      touch.set({ x: e.x, y: e.y, r: 90 });
      if (axis.get() === 1) {
        const from = startX.get();
        const next = from - e.translationX / Math.max(1, width);
        posX.set(Math.max(Math.max(0, from - 1) - 0.08, Math.min(Math.min(3, from + 1) + 0.08, next)));
        return;
      }
      const from = startY.get();
      if (from === 0 && e.translationY > 0 && !reduced) {
        rising.set(true);
        oceanDive.set(Math.max(0, Math.min(1, 1 - e.translationY / Math.max(1, oceanTravel.get()))));
        return;
      }
      const next = from - e.translationY / Math.max(1, height * 0.6);
      posY.set(Math.max(Math.max(0, from - 1), Math.min(Math.min(3, from + 1), next)));
    })
    .onEnd((e) => {
      if (axis.get() === 1) {
        const moved = Math.abs(e.translationX) > width * 0.18 || Math.abs(e.velocityX) > 500;
        const target = moved ? waterDragResult(startX.get(), Math.sign(e.translationX)) : startX.get();
        posX.set(withSpring(target, SPRING));
        runOnJS(settledAt)(target, startY.get());
        return;
      }
      if (rising.get()) {
        settleDiveTo(settleDive(1 - oceanDive.get(), -e.velocityY) === 1 ? 0 : 1, e.velocityY);
        return;
      }
      const moved = Math.abs(e.translationY) > height * 0.12 || Math.abs(e.velocityY) > 500;
      const result = moved ? depthDragResult(startY.get(), Math.sign(e.translationY)) : { depth: startY.get(), surface: false };
      if (result.surface) {
        settleDiveTo(0);
        return;
      }
      posY.set(withSpring(result.depth, SPRING));
      runOnJS(settledAt)(startX.get(), result.depth);
    })
    .onFinalize(() => {
      touch.set(null);
    });
  const tap = Gesture.Tap()
    .maxDistance(12)
    .onBegin((e) => {
      touch.set({ x: e.x, y: e.y, r: 70 });
    })
    .onEnd((e, ok) => {
      if (ok) runOnJS(tapAt)(e.x, e.y);
    })
    .onFinalize(() => {
      touch.set(null);
    });
  const underGesture = Gesture.Exclusive(swim, tap);

  // The water's lower strip, where the tab bar floats: when the bar has faded, it still takes a drag or a wake.
  const floorPan = useDivePan(!under);
  const floorTap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(onWake)();
    });
  const floorGesture = Gesture.Exclusive(floorPan, floorTap);

  const canvasStyle = useAnimatedStyle(() => {
    const d = oceanDive.get();
    return { opacity: oceanReduced.get() ? d : d > 0 ? 1 : 0 };
  });
  const uiStyle = useAnimatedStyle(() => ({ opacity: showsAt(oceanDive.get()).ui }));

  const left = under ? songsLeft(place, species) : 0;
  const heardHere = life?.places[placeKey(place)]?.heard ?? 0;
  const subtitle =
    left > 0
      ? `${WATER_INFO[place.water].caption} · ${left} ${left === 1 ? 'song' : 'songs'} left`
      : heardHere === 0
        ? "You haven't been here yet"
        : `${WATER_INFO[place.water].caption} · You've heard them all`;

  return (
    <>
      <GestureDetector gesture={floorGesture}>
        <View style={[styles.floor, { height: floor }]} pointerEvents={under ? 'none' : 'auto'} />
      </GestureDetector>
      <Animated.View style={[StyleSheet.absoluteFill, canvasStyle]} pointerEvents="none">
        {ready && width > 0 && height > 0 && (
          <OceanCanvas
            width={width}
            height={height}
            dive={reduced || screenReader ? stillDive : oceanDive}
            travel={surfaceY + CLEARANCE}
            surfaceY={surfaceY}
            sea={sea}
            posX={posX}
            posY={posY}
            clock={clock}
            touch={touch}
            spotlight={spotlight}
            rest={rest}
            hour={hour}
            life={life}
            bottles={bottles}
          />
        )}
      </Animated.View>
      {under && (
        <Animated.View style={[StyleSheet.absoluteFill, uiStyle]} pointerEvents="box-none">
          <GestureDetector gesture={underGesture}>
            <View style={StyleSheet.absoluteFill} accessible={false} />
          </GestureDetector>
          <OceanUi
            place={place}
            title={species ? `${SPECIES_INFO[species].means} songs in ${placeLabel(place)}` : null}
            subtitle={subtitle}
            hint={notice ?? wildLine ?? (hintSeen ? null : 'Tap a fish to pick its kind of song.')}
            speciesTag={species ? SPECIES_INFO[species].means : null}
            canSwipe={left > 0}
            allCount={hiddenHere > 0 || screenReader ? (life?.places[placeKey(place)]?.creatures.length ?? 0) : 0}
            onWater={(w: Water) => {
              setSpecies(null);
              setWildLine(null);
              jumpTo({ ...place, water: w }, true);
            }}
            onDepth={(d: Depth) => {
              setSpecies(null);
              setWildLine(null);
              jumpTo({ ...place, depth: d }, true);
            }}
            onSwipe={() => onSwipeHere({ place, species })}
            onBackUp={() => settleDiveTo(0)}
            onPortrait={onPortrait}
            onOpenList={() => onOpenList(place)}
            onClearSpecies={() => {
              setSpecies(null);
              setWildLine(null);
            }}
          />
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
