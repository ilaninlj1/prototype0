import { Blur, Group, Rect, Text, vec, type SkFont } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { EditionSong, Scene } from '@/lib/edition';
import { expoIn, expoOut, lerp, prog } from '@/lib/reel-ease';
import { BK, OR } from './reel-fx';
import { advance, fontOf, type ReelTypefaces } from './reel-type';

type Props = { song: EditionSong; scene: Scene; clock: SharedValue<number>; width: number; height: number; type: ReelTypefaces };

/**
 * The reel's type wall, made of the artist you found: rows of their name in
 * outline sliding in opposite directions (faster for faster songs), and one
 * solid orange copy slamming into the middle.
 */
export function ReelWall({ song, scene, clock, width: W, height: H, type }: Props) {
  const tempo = 60 / song.recipe.beat;
  const lay = useMemo(() => {
    const word = song.artist.toUpperCase().slice(0, 22);
    const size = Math.min(H * 0.12, W * 0.17);
    const font = fontOf(type.black, size);
    const unit = `${word}   `;
    const segW = advance(font, unit);
    const reps = Math.ceil(W / segW) + 3;
    let n = Math.ceil(H / size) + 2;
    if (n % 2 === 0) n++;
    const solidSize = Math.min(size, (W * 0.86 * size) / Math.max(1, advance(font, word)));
    const solid = fontOf(type.black, solidSize);
    const solidW = advance(solid, word);
    return { word, size, font, row: unit.repeat(reps), segW, n, mid: (n - 1) / 2, solid, solidSize, solidW };
  }, [song.artist, W, H, type]);

  const t = useDerivedValue(() => clock.get() - scene.start);
  const top = H / 2 - (lay.n * lay.size) / 2;

  const solidT = useDerivedValue(() => {
    const tt = t.get();
    const v = expoOut(prog(tt, 0.5, 0.85));
    return [{ scale: lerp(1.7, 1, v) * (1 + 0.04 * expoIn(prog(tt, 3.9, 5))) }];
  });
  const solidOpacity = useDerivedValue(() => prog(t.get(), 0.5, 0.56));
  const solidBlur = useDerivedValue(() => {
    const v = expoOut(prog(t.get(), 0.5, 0.85));
    return v < 0.98 ? (1 - v) * 22 : 0;
  });
  const padX = lay.solidSize * 0.14;
  const baseY = H / 2 + lay.solidSize * 0.35;

  return (
    <Group>
      {Array.from({ length: lay.n }, (_, i) => (
        <WallRow key={i} i={i} lay={lay} t={t} top={top} speed={tempo / 120} />
      ))}
      <Group opacity={solidOpacity} origin={vec(W / 2, H / 2)} transform={solidT}>
        <Rect x={(W - lay.solidW) / 2 - padX} y={H / 2 - lay.solidSize * 0.5} width={lay.solidW + padX * 2} height={lay.solidSize} color={BK} />
        <Text x={(W - lay.solidW) / 2} y={baseY} text={lay.word} font={lay.solid} color={OR} opacity={0.5}>
          <Blur blur={18} />
        </Text>
        <Text x={(W - lay.solidW) / 2} y={baseY} text={lay.word} font={lay.solid} color={OR}>
          <Blur blur={solidBlur} />
        </Text>
      </Group>
    </Group>
  );
}

function WallRow({ i, lay, t, top, speed }: { i: number; lay: { size: number; font: SkFont; row: string; segW: number; mid: number }; t: SharedValue<number>; top: number; speed: number }) {
  const y = top + (i + 0.85) * lay.size;
  const off = useDerivedValue(() => {
    const tt = t.get();
    const ramp = 1 + 4 * expoIn(prog(tt, 3.6, 5));
    const dist = lay.size * 1.3 * speed * (tt + (ramp > 1 ? (ramp - 1) * (tt - 3.6) * 0.5 : 0));
    const dir = i % 2 ? 1 : -1;
    const o = dir * dist + i * lay.segW * 0.37;
    const x = -lay.segW + (((o % lay.segW) + lay.segW) % lay.segW);
    const away = Math.abs(i - lay.mid);
    const ev = expoOut(prog(tt, away * 0.05, 0.5 + away * 0.05));
    return { x, dy: (1 - ev) * (i < lay.mid ? -1 : 1) * 40, o: ev * (i === lay.mid ? 0.25 : 1) };
  });
  const tf = useDerivedValue(() => [{ translateX: off.get().x }, { translateY: off.get().dy }]);
  const opacity = useDerivedValue(() => off.get().o);
  return (
    <Group transform={tf} opacity={opacity}>
      <Text x={0} y={y} text={lay.row} font={lay.font} color="rgba(244,241,236,0.32)" style="stroke" strokeWidth={1.2} />
    </Group>
  );
}
