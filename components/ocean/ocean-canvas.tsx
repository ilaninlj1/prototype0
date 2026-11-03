import { Canvas, Picture, createPicture, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnimatedReaction, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { anemonesFor, kelpFor, makeWobble, mixHex, raftsFor, recordBottle, recordSquid, recordSub, waterTone, recordCreature, recordFar, recordFloorDetail, recordHalo, recordNear, recordPlace, recordRaft, songPalette, tendrilsFor, ventsFor, type Trail } from '@/components/ocean/ocean-art';
import { drawGlass, drawOcean, type Stage, type StageMember, type StopRow } from '@/components/ocean/ocean-draw';
import type { Splash } from '@/lib/ocean-splash';
import { anatomyKey } from '@/lib/ocean-anatomy';
import { castFor } from '@/lib/ocean-cast';
import { landmarksAt } from '@/lib/ocean-landmarks';
import { DEPTHS, WATERS, placeKey, type Depth, type Place, type Water } from '@/lib/ocean-map';
import { MAX_BOTTLES, bottleSpot } from '@/lib/ocean-motion';
import { floorSand, type OceanLife } from '@/lib/ocean-person';
import { SAND, dayMixAt, hexToRgb, waterStops, type Rgb } from '@/lib/ocean-scene';
import type { SeaState } from '@/lib/sea-beat';

export type OceanBottle = { id: string; trackId: number; place: Place; color: string; seed: number };

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
  touchPower: SharedValue<number>;
  /** The track whose creature comes forward, or 0. */
  spotlight: SharedValue<number>;
  /** What's playing, so creatures can react to it. */
  song: SharedValue<{ tempo: number; key: number } | null>;
  drawMs: SharedValue<number>;
  splash: SharedValue<Splash>;
  /** Where you are: only this water and the ones either side are kept ready. */
  place: Place;
  rest: Place;
  hour: number;
  life: OceanLife | null;
  bottles: OceanBottle[];
};

const rows = (w: Water, d: Depth, hour: number): StopRow => {
  const s = waterStops(w, d, dayMixAt(hour));
  return { top: hexToRgb(s.top), mid: hexToRgb(s.mid), bot: hexToRgb(s.bot), ray: s.ray };
};
const vividBucket = (v: number) => Math.round(v * 4) / 4;
/** How far down the sand is dimmed: Buried is dark, because almost nobody has heard these. */
const FLOOR_DIM = 0.86;
const ABYSS: Record<Water, string> = { reef: '#04203a', kelp: '#04221f', blue: '#041a40', midnight: '#020818' };

export default function OceanCanvas({ width, height, dive, travel, surfaceY, sea, posX, posY, clock, touch, touchPower, spotlight, song, drawMs, splash, place, rest, hour, life, bottles }: OceanCanvasProps) {
  // Pictures are expensive to record and cheap to draw, so each is kept until its look actually changes.
  const pictures = useRef(new Map<string, { signature: string; picture: SkPicture }>());
  const sprites = useRef(new Map<string, SkPicture[]>());
  const halos = useRef(new Map<string, { faint: SkPicture; bright: SkPicture }>());
  const bottleArt = useRef(new Map<string, SkPicture>());
  const raftArt = useRef(new Map<string, SkPicture>());
  const subArt = useRef<SkPicture | null>(null);
  const squidArt = useRef<SkPicture[] | null>(null);

  // Moving to the next water loads the one beyond it only once the move has settled, so it can't hitch the glide. Tapping
  // a far water keeps everything between ready at once, so you pass through each biome on the way there.
  const col = WATERS.indexOf(place.water);
  const [range, setRange] = useState<[number, number]>([Math.max(0, col - 1), Math.min(3, col + 1)]);
  useEffect(() => {
    setRange(([lo, hi]) => (col < lo || col > hi ? [Math.min(lo, col), Math.max(hi, col)] : [lo, hi]));
    const t = setTimeout(() => setRange([Math.max(0, col - 1), Math.min(3, col + 1)]), 1500);
    return () => clearTimeout(t);
  }, [col]);

  const hourKey = Math.floor(hour);
  const nearArt = useMemo(() => WATERS.map((w) => recordNear(w, width, height)), [width, height]);
  const farArt = useMemo(() => WATERS.map((w) => recordFar(w, width, height)), [width, height]);
  const stages = useMemo(() => {
    const out: Stage[] = [];
    for (let c = range[0]; c <= range[1]; c++) {
      const water = WATERS[c];
      const sand = floorSand(life, water);
      const hereCoral = (key: string) => life?.places[key]?.coral ?? [];
      // Kelp stems run the whole depth, so every song you heard in this water adds one to every level.
      const stems = DEPTHS.flatMap((d) => hereCoral(placeKey({ water, depth: d }))).map((p) => ({ color: p.color, seed: p.seed }));
      // A climbed fish's trail runs back down through every level it passed.
      const climbers = Object.values(life?.places ?? {}).flatMap((p) => (p.place.water === water ? p.creatures.filter((m) => m.climb > 0) : []));
      const trailsIn = (row: number): Trail[] =>
        climbers.flatMap((m) => {
          const nowRow = DEPTHS.indexOf(m.place.depth);
          if (row < nowRow || row > m.foundRow) return [];
          const cast = castFor(m.place, life, hour).members.find((x) => x.creature.trackId === m.trackId);
          if (!cast) return [];
          const home = (0.18 + 0.64 * cast.x) * width;
          const y = (0.2 + 0.52 * Math.max(0, Math.min(1, cast.band))) * height;
          return [{ x: home, y0: row === nowRow ? y : 0, y1: row === m.foundRow ? y : height, color: m.color, seed: m.seed % 7 }];
        });
      DEPTHS.forEach((depth, row) => {
        const here: Place = { water, depth };
        const key = placeKey(here);
        const lives = life?.places[key];
        const trails = trailsIn(row);
        const subHere = landmarksAt(here).find((l) => l.kind === 'sub');
        const squidHere = landmarksAt(here).find((l) => l.kind === 'squid');
        const signature = `${width}x${height}|${(lives?.coral ?? []).map((p) => p.trackId).join()}|${row === 3 ? sand.specks.length : 0}|${trails.map((t) => `${t.y0.toFixed(0)}:${t.y1.toFixed(0)}`).join()}`;
        let cached = pictures.current.get(key);
        if (!cached || cached.signature !== signature) {
          cached = { signature, picture: recordPlace(here, width, height, lives?.coral ?? [], row === 3 ? sand : null, trails) };
          pictures.current.set(key, cached);
        }
        const members: StageMember[] = castFor(here, life, hour).members.map((m) => {
          const a = m.creature;
          const bucket = vividBucket(a.vivid);
          const spriteKey = `${m.look}|${a.color}|${a.accent}|${bucket}|${anatomyKey(a.anatomy)}|${key}|${m.z}`;
          let frames = sprites.current.get(spriteKey);
          if (!frames) {
            frames = recordCreature(m.look, a.anatomy, songPalette(a.color, a.accent, bucket, waterTone(here), row, m.z));
            sprites.current.set(spriteKey, frames);
          }
          let halo = halos.current.get(a.color);
          if (!halo) {
            const light = mixHex(a.color, '#ffffff', 0.25);
            halo = { faint: recordHalo(light, false), bright: recordHalo(light, true) };
            halos.current.set(a.color, halo);
          }
          return {
            look: m.look,
            frames,
            faint: halo.faint,
            bright: halo.bright,
            z: m.z,
            seed: m.seed,
            pace: m.pace,
            band: m.band,
            x: m.x,
            scale: m.scale,
            reach: m.reach,
            awake: m.awake,
            leader: m.leader,
            schoolIndex: m.schoolIndex,
            rare: a.rare,
            trackId: a.trackId,
            restI: m.restI,
            restN: m.restN,
            tempo: m.tempo,
            songKey: m.songKey,
            big: m.look === 'manta' || (m.scale >= 1.5 && m.look !== 'jelly'),
          };
        });
        // Bottles float, so a water's bottles all bob near the top of its Popular level.
        const hereBottles = row === 0 ? bottles.filter((b) => b.place.water === water).slice(0, MAX_BOTTLES) : [];
        out.push({
          col: c,
          row,
          picture: cached.picture,
          near: nearArt[c],
          weeds: water === 'kelp' ? kelpFor(here, width, height, stems) : [],
          anemones: anemonesFor(here, width, height),
          rafts: raftsFor(here, width, height, lives?.coral ?? [], (color) => {
            let art = raftArt.current.get(color);
            if (!art) {
              art = recordRaft(color, width / 270);
              raftArt.current.set(color, art);
            }
            return art;
          }),
          ribbons: water === 'blue',
          tendrils: tendrilsFor(here, width, height, lives?.coral ?? []),
          vents: ventsFor(here, width, height),
          sub: subHere ? { sprite: (subArt.current ??= recordSub(here, width / 270)), fx: subHere.fx, fy: subHere.fy ?? 0.4 } : null,
          squid: squidHere ? { frames: (squidArt.current ??= recordSquid(here, width / 270)), fx: squidHere.fx, fy: squidHere.fy ?? 0.4 } : null,
          members,
          order: members.map((_, i) => i).sort((a, b) => members[a].z - members[b].z || a - b),
          bottles: hereBottles.map((b, i) => {
            let art = bottleArt.current.get(b.color);
            if (!art) {
              art = recordBottle(b.color);
              bottleArt.current.set(b.color, art);
            }
            const spot = bottleSpot(i, hereBottles.length, width, height);
            return { sprite: art, x: spot.x, y: spot.y };
          }),
        });
      });
    }
    return out;
    // hour moves only the cast; recorded art is cached above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, life, bottles, hourKey, range]);

  const stops = useMemo(() => DEPTHS.map((d) => WATERS.map((w) => rows(w, d, hour))), [hourKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const restStops = useMemo(() => rows(rest.water, rest.depth, hour), [rest.water, rest.depth, hourKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = dayMixAt(hour);
  const floorDetail = useMemo(() => recordFloorDetail(width, height), [width, height]);
  const wobble = useMemo(() => makeWobble(), []);
  const { floorTop, floorBot, rises } = useMemo(() => {
    const dim = (w: Water, hexColor: string): Rgb => hexToRgb(mixHex(hexColor, ABYSS[w], FLOOR_DIM));
    return {
      floorTop: WATERS.map((w) => dim(w, SAND[w][0])),
      floorBot: WATERS.map((w) => dim(w, SAND[w][1])),
      rises: WATERS.map((w) => floorSand(life, w).rise),
    };
  }, [life]);

  // The creature your song belongs to eases forward and eases back, rather than jumping.
  const spotMix = useSharedValue(0);
  const spotId = useSharedValue(0);
  useAnimatedReaction(
    () => spotlight.get(),
    (id, was) => {
      if (id === was) return;
      if (id) {
        spotId.set(id);
        spotMix.set(0);
        spotMix.set(withTiming(1, { duration: 1200 }));
      } else spotMix.set(withTiming(0, { duration: 900 }));
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
      touchPower: touchPower.get(),
      spotId: spotId.get(),
      spotMix: spotMix.get(),
      song: song.get(),
      night,
      warm,
      stops,
      rest: restStops,
      stages,
      floorTop,
      floorBot,
      rises,
      floorDetail,
      far: farArt,
      splash: splash.get(),
      wobble,
    };
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result = createPicture(
      (c) => {
        if (d > 0) drawOcean(c, f);
        if (f.splash.kind === 2) drawGlass(c, f);
      },
      { width, height }
    );
    drawMs.set((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started);
    return result;
  }, [width, height, travel, surfaceY, night, warm, stops, restStops, stages, floorTop, floorBot, rises, floorDetail, farArt, wobble]);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}

