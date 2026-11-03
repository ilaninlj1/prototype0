// Who is on stage in a place right now. The canvas draws it and the tap test reads it, so they always agree.

import type { Kind, Place } from './ocean-map.ts';
import { placeKey } from './ocean-map.ts';
import { isAwake, type Creature, type OceanLife } from './ocean-person.ts';
import { wildRoster, type WildFish, type WildLook } from './ocean-scene.ts';

export type CastMember = {
  key: string;
  look: WildLook | Kind;
  wild: WildFish | null;
  creature: Creature | null;
  seed: number;
  speed: number;
  band: number;
  x: number;
  scale: number;
  awake: boolean;
  school: number;
  schoolIndex: number;
};

export const MAX_ANIMATED = 40;

const SPEED: Record<Kind, number> = { jelly: 3, turtle: 10, puffer: 8, darter: 28, clown: 15, drifter: 12 };

const unit = (seed: number, salt: number) => {
  const v = Math.sin((seed + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

function yours(c: Creature, school: number, schoolIndex: number, awake: boolean): CastMember {
  const dir = unit(c.seed, 4) < 0.5 ? 1 : -1;
  return {
    key: `song:${c.trackId}`,
    look: c.kind,
    wild: null,
    creature: c,
    seed: c.seed,
    speed: SPEED[c.kind] * dir * (0.8 + unit(c.seed, 5) * 0.4),
    band: unit(c.seed, 6),
    x: unit(c.seed, 7),
    scale: c.size,
    awake,
    school,
    schoolIndex,
  };
}

function wildMember(f: WildFish): CastMember {
  return { key: `wild:${f.id}`, look: f.look, wild: f, creature: null, seed: f.seed, speed: f.speed, band: f.band, x: f.x, scale: f.scale, awake: true, school: f.school, schoolIndex: 0 };
}

/** Wild ones thin out as your songs move in: all of them at none of yours, about half at 10, 2 at 25 or more. */
function wildLeft(rosterSize: number, mine: number): number {
  if (mine >= 25) return 2;
  return Math.max(2, Math.round(rosterSize - (rosterSize - 2) * (mine / 16)));
}

export function castFor(place: Place, life: OceanLife | null, hour: number): { members: CastMember[]; hiddenCount: number } {
  const here = life?.places[placeKey(place)]?.creatures ?? [];
  const roster = wildRoster(place);
  const swimmers = roster.filter((f) => f.look !== 'crab' && f.look !== 'starfish');
  const floorLife = roster.filter((f) => f.look === 'crab' || f.look === 'starfish');

  // buildOcean already sorts each place newest first, with undated finds last.
  const kept = here.slice(0, Math.max(0, MAX_ANIMATED - floorLife.length - 2));
  const hiddenCount = here.length - kept.length;

  const schools = new Map<string, { number: number; next: number }>();
  const mine = kept.map((c) => {
    let school = 0;
    let schoolIndex = 0;
    if (c.school) {
      const known = schools.get(c.school) ?? { number: schools.size + 1, next: 0 };
      schools.set(c.school, known);
      school = known.number;
      schoolIndex = known.next++;
    }
    return yours(c, school, schoolIndex, isAwake(c, hour));
  });

  let wildCount = wildLeft(swimmers.length, mine.length);
  const awakeMine = mine.filter((m) => m.awake).length;
  // If most of yours are asleep at this hour, wild ones come back so the water never feels dead.
  const total = mine.length + wildCount;
  if (total > 0 && (awakeMine + wildCount) / total < 1 / 3) wildCount = Math.min(swimmers.length, Math.ceil(mine.length / 2 - awakeMine) + 1);

  const room = MAX_ANIMATED - mine.length - floorLife.length;
  const wild = swimmers.slice(0, Math.max(0, Math.min(wildCount, room))).map(wildMember);
  return { members: [...floorLife.map(wildMember), ...wild, ...mine], hiddenCount };
}
