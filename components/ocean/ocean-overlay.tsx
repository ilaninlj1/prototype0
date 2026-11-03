import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { oceanDive, oceanReduced, oceanTravel, onDiveSettled, settleDiveTo, surfaceNow, useDivePan } from '@/components/ocean/dive-gesture';
import type { OceanBottle } from '@/components/ocean/ocean-canvas';
import { OceanChart } from '@/components/ocean/ocean-chart';
import { OceanUi } from '@/components/ocean/ocean-ui';
import { lazySkia } from '@/components/print/lazy-skia';
import { useScreenReader } from '@/hooks/use-screen-reader';
import { castFor } from '@/lib/ocean-cast';
import type { PathPoint } from '@/lib/ocean-chart';
import { depthDragResult, nearestPlaceIndex, settleDive, showsAt, waterDragResult } from '@/lib/ocean-dive';
import { hitMember } from '@/lib/ocean-hit';
import { DEPTHS, WATERS, WATER_INFO, placeKey, type Depth, type Place, type Water } from '@/lib/ocean-map';
import { MAX_BOTTLES, bottleSpot, stagePoses } from '@/lib/ocean-motion';
import type { Creature, OceanLife } from '@/lib/ocean-person';
import { DIVE_IN_AT, DIVE_OUT_AT, NO_SPLASH, splashOver, splashPower, type Splash } from '@/lib/ocean-splash';
import type { SeaState } from '@/lib/sea-beat';

const OceanCanvas = lazySkia(() => import('./ocean-canvas'));

const PLACE_KEY = 'blindspotDiscovery:oceanPlace';
const HINT_KEY = 'blindspotDiscovery:oceanHintSeen';
/** How far the surface travels past the top of the phone, so it leaves the screen fully. */
const CLEARANCE = 34;
const SPRING = { damping: 24, stiffness: 120, mass: 0.9, overshootClamping: true };
const GREET_MS = 3500;

export type OceanHandlers = {
  songsLeft: (place: Place) => number;
  onSwipeHere: (place: Place) => void;
  onWake: () => void;
  onUnderChange: (under: boolean) => void;
  onPlaceChange: (place: Place) => void;
  onTapCreature: (creature: Creature, soundAlike: boolean) => void;
  onTapBottle: (bottle: OceanBottle) => void;
  onPortrait: () => void;
  onOpenList: (place: Place) => void;
  onExample: () => void;
  listeningPath: () => PathPoint[];
};

export const OceanOverlay = memo(function OceanOverlay({
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
  song,
  activePlace,
  jump,
  notice,
  offerExample,
  heardCount,
  handlers,
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
  /** The track whose creature comes forward, or 0. */
  spotlight: SharedValue<number>;
  /** What's playing, so creatures can react. */
  song: SharedValue<{ tempo: number; key: number } | null>;
  /** The place an ocean filter is on, so you arrive there. */
  activePlace: Place | null;
  /** A request to go under, to a place: from Details, the Library or You. */
  jump: { place: Place; key: number } | null;
  /** A line under the pill, when this isn't your own ocean. */
  notice: string | null;
  offerExample: boolean;
  /** Changes when the songs you've heard change, so the count of songs left stays true. */
  heardCount: number;
  /** Home's callbacks, always current without re-rendering the ocean each time Home does. */
  handlers: RefObject<OceanHandlers>;
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
  const [hintSeen, setHintSeen] = useState(true);
  const posX = useSharedValue(0);
  const posY = useSharedValue(0);
  const clock = useSharedValue(0);
  const touch = useSharedValue<{ x: number; y: number; r: number } | null>(null);
  const touchPower = useSharedValue(0);
  const running = useSharedValue(false);
  const stillDive = useSharedValue(1);
  const drawMs = useSharedValue(0);
  const metering = useSharedValue(false);
  const [meter, setMeter] = useState<string | null>(null);
  const [chart, setChart] = useState<PathPoint[] | null>(null);
  const splash = useSharedValue<Splash>(NO_SPLASH);
  const lastDive = useSharedValue(0);
  if (Platform.OS === 'web') (globalThis as { __ocean?: unknown }).__ocean = { posX, posY, dive: oceanDive, splash };

  // The scene only loads once Home has settled, so Home's first moments stay quick.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const remember = useCallback(
    (next: Place) => {
      setPlace(next);
      handlers.current?.onPlaceChange(next);
      void AsyncStorage.setItem(PLACE_KEY, JSON.stringify(next)).catch(() => {});
    },
    [handlers]
  );
  const jumpTo = useCallback(
    (next: Place, animated: boolean) => {
      const x = WATERS.indexOf(next.water);
      const y = DEPTHS.indexOf(next.depth);
      posX.set(animated && !reduced ? withSpring(x, SPRING) : x);
      posY.set(animated && !reduced ? withSpring(y, SPRING) : y);
      remember(next);
    },
    [posX, posY, reduced, remember]
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
        handlers.current?.onUnderChange(nowUnder);
      }),
    [handlers]
  );

  // Leaving Home always puts you back at the surface, so no other tab ever finds it half slid.
  useEffect(() => {
    running.set(focused);
    if (!focused && oceanDive.get() > 0) surfaceNow();
  }, [focused, running]);

  useEffect(() => {
    if (!under) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      settleDiveTo(0);
      return true;
    });
    return () => sub.remove();
  }, [under]);

  const pushMeter = useCallback((fps: number, worst: number, ms: number) => setMeter(`${fps} fps · worst ${worst} ms · draw ${ms} ms`), []);
  const window = useSharedValue({ frames: 0, total: 0, worst: 0 });
  const thump = useCallback((power: number) => {
    if (power > 0.55) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);
  useFrameCallback((f) => {
    const dt = f.timeSincePreviousFrame ?? 16;
    // Crossing the surface starts the splash, and how fast the water was moving sets how big it is.
    const d = oceanDive.get();
    const was = lastDive.get();
    lastDive.set(d);
    if (!oceanReduced.get()) {
      const speed = ((d - was) / Math.max(dt, 8)) * 1000;
      const now = splash.get();
      if (was <= DIVE_IN_AT && d > DIVE_IN_AT) {
        const power = splashPower(speed);
        splash.set({ kind: 1, e: 0, power, y0: surfaceY - d * oceanTravel.get() });
        runOnJS(thump)(power);
      } else if (was >= DIVE_OUT_AT && d < DIVE_OUT_AT) splash.set({ kind: 2, e: 0, power: splashPower(speed), y0: 0 });
      else if (now.kind !== 0) {
        const next: Splash = { ...now, e: now.e + Math.min(64, dt) / 1000 };
        splash.set(splashOver(next) ? NO_SPLASH : next);
      }
    }
    if (reduced || !running.get() || oceanDive.get() <= 0) return;
    clock.set(clock.get() + Math.min(64, dt) / 1000);
    if (!metering.get()) return;
    const m = window.get();
    const next = { frames: m.frames + 1, total: m.total + dt, worst: Math.max(m.worst, dt) };
    if (next.frames >= 30) {
      runOnJS(pushMeter)(Math.round((1000 * next.frames) / next.total), Math.round(next.worst), Math.round(drawMs.get()));
      window.set({ frames: 0, total: 0, worst: 0 });
    } else window.set(next);
  });
  const toggleMeter = useCallback(() => {
    const on = !metering.get();
    metering.set(on);
    if (!on) setMeter(null);
    else setMeter('Measuring…');
  }, [metering]);

  const cast = useMemo(() => castFor(place, life, hour), [place, life, hour]);

  // Your newest find comes over to say hello when you arrive.
  const placeId = placeKey(place);
  useEffect(() => {
    if (!under) return;
    const first = cast.members.find((m) => m.awake);
    if (!first || spotlight.get() !== 0) return;
    const id = first.creature.trackId;
    spotlight.set(id);
    const t = setTimeout(() => {
      if (spotlight.get() === id) spotlight.set(0);
    }, GREET_MS);
    return () => clearTimeout(t);
    // When you arrive somewhere; not each time the cast's objects change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [under, placeId]);

  // Everything a gesture needs from React, read when it fires, so the gestures themselves never change mid drag.
  const now = useRef({ place, cast, bottles, width, height, remember });
  now.current = { place, cast, bottles, width, height, remember };
  const [js] = useState(() => ({
    // Only React's copy of where you are: the spring that's carrying you there must not be interrupted.
    settled(waterIndex: number, depthIndex: number) {
      const next = { water: WATERS[waterIndex], depth: DEPTHS[depthIndex] };
      if (placeKey(next) !== placeKey(now.current.place)) now.current.remember(next);
    },
    tap(x: number, y: number) {
      const n = now.current;
      const col = WATERS.indexOf(n.place.water);
      const row = DEPTHS.indexOf(n.place.depth);
      const members = n.cast.members;
      const poses = stagePoses(members, col, row, clock.get(), n.width, n.height);
      const i = hitMember(x, y, members, poses);
      if (i != null) {
        void AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
        setHintSeen(true);
        handlers.current?.onTapCreature(members[i].creature, members[i].soundAlike);
        return;
      }
      const here = row === 0 ? n.bottles.filter((b) => b.place.water === n.place.water).slice(0, MAX_BOTTLES) : [];
      for (let b = 0; b < here.length; b++) {
        const spot = bottleSpot(b, here.length, n.width, n.height);
        if (Math.hypot(spot.x - x, spot.y - y) < 30) return handlers.current?.onTapBottle(here[b]);
      }
    },
    wake() {
      handlers.current?.onWake();
    },
    openChart() {
      setChart(handlers.current?.listeningPath() ?? []);
    },
  }));

  // One finger: sideways changes water, up sinks, down rises, and down from Popular brings you to the surface.
  const axis = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const rising = useSharedValue(false);
  const underGesture = useMemo(() => {
    const swim = Gesture.Pan()
      .minDistance(12)
      .maxPointers(1)
      .onBegin(() => {
        axis.set(0);
      })
      .onStart(() => {
        startX.set(nearestPlaceIndex(posX.get()));
        startY.set(nearestPlaceIndex(posY.get()));
        rising.set(false);
      })
      .onUpdate((e) => {
        // Sideways or up and down is decided by the first real movement: at the start both can still read zero.
        if (axis.get() === 0) {
          const ax = Math.abs(e.translationX);
          const ay = Math.abs(e.translationY);
          if (ax < 4 && ay < 4) return;
          axis.set(ax > ay ? 1 : 2);
        }
        if (axis.get() === 1) {
          const from = startX.get();
          const next = from - e.translationX / Math.max(1, width);
          posX.set(Math.max(Math.max(0, from - 1) - 0.06, Math.min(Math.min(3, from + 1) + 0.06, next)));
          return;
        }
        const from = startY.get();
        if (from === 0 && e.translationY > 0 && !reduced) {
          rising.set(true);
          oceanDive.set(Math.max(0, Math.min(1, 1 - e.translationY / Math.max(1, oceanTravel.get()))));
          return;
        }
        // Changed your mind mid-rise: all the way back under before sinking.
        if (rising.get()) {
          rising.set(false);
          oceanDive.set(1);
        }
        const next = from - e.translationY / Math.max(1, height * 0.6);
        posY.set(Math.max(Math.max(0, from - 1), Math.min(Math.min(3, from + 1), next)));
      })
      .onEnd((e) => {
        if (axis.get() === 0) return;
        if (axis.get() === 1) {
          const moved = Math.abs(e.translationX) > width * 0.18 || Math.abs(e.velocityX) > 500;
          const target = moved ? waterDragResult(startX.get(), Math.sign(e.translationX)) : startX.get();
          // The glide carries on at the speed your finger left at, so letting go is seamless.
          posX.set(withSpring(target, { ...SPRING, velocity: -e.velocityX / Math.max(1, width) }));
          runOnJS(js.settled)(target, startY.get());
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
        posY.set(withSpring(result.depth, { ...SPRING, velocity: -e.velocityY / Math.max(1, height * 0.6) }));
        runOnJS(js.settled)(startX.get(), result.depth);
      })
      .onFinalize((_e, success) => {
        // A drag the system took away never leaves you between places.
        if (success || axis.get() === 0) return;
        if (oceanDive.get() > 0 && oceanDive.get() < 1) settleDiveTo(1);
        posX.set(withSpring(startX.get(), SPRING));
        posY.set(withSpring(startY.get(), SPRING));
      });
    const tap = Gesture.Tap()
      .maxDistance(12)
      .onBegin((e) => {
        touch.set({ x: e.x, y: e.y, r: 90 });
        touchPower.set(withTiming(1, { duration: 220 }));
      })
      .onEnd((e, ok) => {
        if (ok) runOnJS(js.tap)(e.x, e.y);
      })
      .onFinalize(() => {
        touchPower.set(withTiming(0, { duration: 420 }));
      });
    // Pinching in pulls back to see the whole ocean as one graph.
    const pinch = Gesture.Pinch().onEnd((e) => {
      if (e.scale < 0.82) runOnJS(js.openChart)();
    });
    return Gesture.Simultaneous(pinch, Gesture.Exclusive(swim, tap));
    // The shared values never change, and js reads everything else when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, reduced]);

  // The water's lower strip, where the tab bar floats: when the bar has faded, it still takes a drag or a wake.
  const floorPan = useDivePan(!under);
  const floorGesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(12)
      .onEnd((_e, ok) => {
        if (ok) runOnJS(js.wake)();
      });
    return Gesture.Exclusive(floorPan, tap);
  }, [floorPan, js]);

  const canvasStyle = useAnimatedStyle(() => {
    const d = oceanDive.get();
    // It stays up just after you surface, for the drops running down the glass.
    return { opacity: oceanReduced.get() ? d : d > 0 || splash.get().kind === 2 ? 1 : 0 };
  });
  const uiStyle = useAnimatedStyle(() => ({ opacity: showsAt(oceanDive.get()).ui }));

  // Counted when you arrive or your history changes, not each time something else redraws.
  const left = useMemo(() => (under ? (handlers.current?.songsLeft(place) ?? 0) : 0), [under, place, heardCount, handlers]);
  const here = life?.places[placeKey(place)];
  const subtitle =
    left > 0
      ? `${WATER_INFO[place.water].caption} · ${left} ${left === 1 ? 'song' : 'songs'} left`
      : (here?.heard ?? 0) === 0
        ? "You haven't been here yet"
        : `${WATER_INFO[place.water].caption} · You've heard them all`;
  const empty = (life?.total ?? 0) === 0;
  const hint = notice ?? (empty ? 'Nothing lives here yet. Save a song blind and it hatches here.' : !here?.creatures.length ? 'None of your songs live here yet.' : hintSeen ? null : 'Tap a creature to see why it looks like that.');

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
            touchPower={touchPower}
            spotlight={spotlight}
            song={song}
            drawMs={drawMs}
            splash={splash}
            place={place}
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
            subtitle={meter ?? subtitle}
            hint={hint}
            canSwipe={left > 0}
            offerExample={offerExample}
            allCount={cast.hiddenCount > 0 || screenReader ? (here?.creatures.length ?? 0) : 0}
            onWater={(w: Water) => jumpTo({ ...place, water: w }, true)}
            onDepth={(d: Depth) => jumpTo({ ...place, depth: d }, true)}
            onSwipe={() => handlers.current?.onSwipeHere(place)}
            onBackUp={() => settleDiveTo(0)}
            onPortrait={() => handlers.current?.onPortrait()}
            onOpenList={() => handlers.current?.onOpenList(place)}
            onExample={() => handlers.current?.onExample()}
            onChart={js.openChart}
            onToggleMeter={toggleMeter}
          />
        </Animated.View>
      )}
      {under && chart && (
        <OceanChart
          life={life}
          path={chart}
          hour={hour}
          onPickCreature={(c) => handlers.current?.onTapCreature(c, false)}
          onPickPlace={(p) => {
            setChart(null);
            jumpTo(p, false);
          }}
          onClose={() => setChart(null)}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
