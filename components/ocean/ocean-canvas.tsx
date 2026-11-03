import { Canvas, Picture, Skia, createPicture, type SkPicture } from '@shopify/react-native-skia';
import { useMemo, useRef } from 'react';
import { useAnimatedReaction, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { PALE, mixHex, recordBottle, recordHalo, recordPlace, recordSprite, songPalette, weedsFor } from '@/components/ocean/ocean-art';
import { drawOcean, type Stage, type StageMember, type StopRow } from '@/components/ocean/ocean-draw';
import { castFor } from '@/lib/ocean-cast';
import { DEPTHS, WATERS, allPlaces, placeKey, type Place } from '@/lib/ocean-map';
import type { OceanLife } from '@/lib/ocean-person';
import { dayMixAt, hexToRgb, waterStops } from '@/lib/ocean-scene';
import type { SeaState } from '@/lib/sea-beat';

export type OceanBottle = { id: string; place: Place; color: string; seed: number };

export type OceanCanvasProps = {
  width: number;
  height: number;
  dive: SharedValue<number>;
  travel: number;
  surfaceY: number;
  sea: SharedValue<SeaState>;
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  clock: SharedValue<number>;
  touch: SharedValue<{ x: number; y: number; r: number } | null>;
  /** The track whose creature lights up and comes forward, or 0. */
  spotlight: SharedValue<number>;
  rest: Place;
  hour: number;
  life: OceanLife | null;
  bottles: OceanBottle[];
};

const rows = (w: string, d: string, hour: number): StopRow => {
  const s = waterStops(w as never, d as never, dayMixAt(hour));
  return { top: hexToRgb(s.top), mid: hexToRgb(s.mid), bot: hexToRgb(s.bot), ray: s.ray };
};

const HALO_DEEP = '#9fd8ff';
const vividBucket = (v: number) => Math.round(v * 4) / 4;

export default function OceanCanvas({ width, height, dive, travel, surfaceY, sea, posX, posY, clock, touch, spotlight, rest, hour, life, bottles }: OceanCanvasProps) {
  // Pictures are expensive to record and cheap to draw, so each is kept until its look actually changes.
  const places = useRef(new Map<string, { signature: string; picture: SkPicture }>());
  const spriteIndex = useRef(new Map<string, number>());
  const spriteList = useRef<SkPicture[][]>([]);
  const haloIndex = useRef(new Map<string, number>());
  const haloList = useRef<SkPicture[]>([]);
  const bottleArt = useRef(new Map<string, SkPicture>());

  const hourKey = Math.floor(hour);
  const { stages, sprites, halos } = useMemo(() => {
    const sizeKey = `${width}x${height}`;
    function sprite(look: string, key: string, palette: () => typeof PALE): number {
      const full = `${look}|${key}`;
      let at = spriteIndex.current.get(full);
      if (at == null) {
        at = spriteList.current.length;
        spriteList.current.push(recordSprite(look as never, palette()));
        spriteIndex.current.set(full, at);
      }
      return at;
    }
    function halo(color: string): number {
      let at = haloIndex.current.get(color);
      if (at == null) {
        at = haloList.current.length;
        haloList.current.push(recordHalo(color));
        haloIndex.current.set(color, at);
      }
      return at;
    }
    const out: Stage[] = allPlaces().map((place) => {
      const key = placeKey(place);
      const here = life?.places[key];
      const signature = `${sizeKey}|${(here?.coral ?? []).map((c) => c.trackId).join()}|${here?.sand.specks.length ?? 0}`;
      let cached = places.current.get(key);
      if (!cached || cached.signature !== signature) {
        cached = { signature, picture: recordPlace(place, width, height, here?.coral ?? [], here?.sand ?? null, (c) => c) };
        places.current.set(key, cached);
      }
      const cast = castFor(place, life, hour).members;
      const leaders = new Map<number, number>();
      const asleep = cast.filter((m) => !m.awake);
      const members: StageMember[] = cast.map((m, i) => {
        if (m.school > 0 && m.creature && !leaders.has(m.school)) leaders.set(m.school, i);
        const c = m.creature;
        const bucket = c ? vividBucket(c.vivid) : 0;
        const look = m.look;
        return {
          look,
          sprite: c ? sprite(look, `${c.color}|${bucket}`, () => songPalette(c.color, bucket)) : sprite(look, 'pale', () => PALE),
          halo: c ? halo(mixHex(c.color, '#ffffff', 0.25)) : look === 'jelly' || look === 'angler' ? halo(HALO_DEEP) : -1,
          seed: m.seed,
          speed: m.speed,
          band: m.band,
          x: m.x,
          scale: m.scale,
          awake: m.awake,
          flock: !c ? m.school : 0,
          leader: c && m.school > 0 && m.schoolIndex > 0 ? (leaders.get(m.school) ?? -1) : -1,
          schoolIndex: m.schoolIndex,
          rare: !!c?.rare,
          trackId: c?.trackId ?? -1,
          restI: asleep.indexOf(m),
          restN: asleep.length,
          big: look === 'whale' || (m.scale >= 1.5 && look !== 'jelly'),
        };
      });
      const hereBottles = bottles.filter((b) => placeKey(b.place) === key);
      return {
        col: WATERS.indexOf(place.water),
        row: DEPTHS.indexOf(place.depth),
        picture: cached.picture,
        weeds: weedsFor(place, width, height).map((w) => ({ ...w, color: Skia.Color(w.color) })),
        members,
        bottles: hereBottles.map((b, i) => {
          let art = bottleArt.current.get(b.color);
          if (!art) {
            art = recordBottle(b.color);
            bottleArt.current.set(b.color, art);
          }
          return { sprite: art, seed: b.seed, i, n: hereBottles.length };
        }),
      };
    });
    return { stages: out, sprites: [...spriteList.current], halos: [...haloList.current] };
    // hour moves only the cast; recorded art is cached above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, life, bottles, hourKey]);

  const stops = useMemo(() => DEPTHS.map((d) => WATERS.map((w) => rows(w, d, hour))), [hourKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const restStops = useMemo(() => rows(rest.water, rest.depth, hour), [rest.water, rest.depth, hourKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = dayMixAt(hour);

  // The creature your song belongs to eases forward, rather than jumping.
  const spotMix = useSharedValue(0);
  useAnimatedReaction(
    () => spotlight.get(),
    (id, was) => {
      if (id === was) return;
      spotMix.set(0);
      if (id) spotMix.set(withTiming(1, { duration: 1200 }));
    }
  );

  const night = day.night;
  const warm = day.warm;
  const picture = useDerivedValue(() => {
    const d = dive.get();
    const f = {
      width,
      height,
      dive: d,
      travel,
      surfaceY,
      t: clock.get(),
      sea: sea.get(),
      posX: posX.get(),
      posY: posY.get(),
      touch: touch.get(),
      spotId: spotlight.get(),
      spotMix: spotMix.get(),
      night,
      warm,
      stops,
      rest: restStops,
      stages,
      sprites,
      halos,
    };
    return createPicture(
      (c) => {
        if (d > 0) drawOcean(c, f);
      },
      { width, height }
    );
  }, [width, height, travel, surfaceY, night, warm, stops, restStops, stages, sprites, halos]);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}
