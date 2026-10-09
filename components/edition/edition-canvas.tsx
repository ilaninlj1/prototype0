import { Canvas, Group, RadialGradient, Rect, Text, vec } from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { timeline, wipes, type Edition, type Scene } from '@/lib/edition';
import { BK, Grain, Progress, Vignette, Wipes } from './reel-fx';
import { ReelData } from './reel-data';
import { ReelIntro } from './reel-intro';
import { ReelOutro } from './reel-outro';
import { ReelParticles } from './reel-particles';
import { advance, fontOf, useReelTypefaces } from './reel-type';
import { ReelVoxel } from './reel-voxel';
import { ReelWall } from './reel-wall';

export type EditionCanvasProps = { edition: Edition; width: number; height: number; clock: SharedValue<number> };

/**
 * The Edition, styled on claude-motion-reel.html: intro slam, one scene per
 * song in the reel's families (voxel field, type wall, data, particles,
 * interface), outro, with the reel's wipes, vignette, grain and progress line
 * over everything. Hard cuts like the reel; the wipe covers each one.
 * Load it through edition-view.tsx (Skia on web).
 */
export default function EditionCanvas({ edition, width: W, height: H, clock }: EditionCanvasProps) {
  const type = useReelTypefaces();
  const scenes = useMemo(() => timeline(edition), [edition]);
  const cuts = useMemo(() => wipes(scenes), [scenes]);

  return (
    <Canvas style={{ width: W, height: H }} pointerEvents="none">
      <Rect x={0} y={0} width={W} height={H} color={BK} />
      {type &&
        scenes.map((scene, i) => (
          <SceneLayer key={i} scene={scene} clock={clock}>
            {scene.kind === 'intro' ? (
              <ReelIntro scene={scene} clock={clock} width={W} height={H} type={type} />
            ) : scene.kind === 'outro' ? (
              <ReelOutro edition={edition} scene={scene} clock={clock} width={W} height={H} type={type} />
            ) : scene.kind === 'voxel' ? (
              <ReelVoxel song={edition.songs[scene.song!]} scene={scene} clock={clock} width={W} height={H} />
            ) : scene.kind === 'wall' ? (
              <ReelWall song={edition.songs[scene.song!]} scene={scene} clock={clock} width={W} height={H} type={type} />
            ) : scene.kind === 'data' ? (
              <ReelData song={edition.songs[scene.song!]} index={scene.song!} scene={scene} clock={clock} width={W} height={H} type={type} />
            ) : scene.kind === 'particles' ? (
              <ReelParticles song={edition.songs[scene.song!]} scene={scene} clock={clock} width={W} height={H} type={type} />
            ) : (
              <InterfaceGround width={W} height={H} type={type} />
            )}
          </SceneLayer>
        ))}
      <Wipes wipes={cuts} clock={clock} width={W} height={H} />
      <Vignette width={W} height={H} />
      <Grain width={W} height={H} clock={clock} />
      <Progress width={W} height={H} clock={clock} />
    </Canvas>
  );
}

/** Each scene is on only for its own slice of the clock: hard cuts, as in the reel. */
function SceneLayer({ scene, clock, children }: { scene: Scene; clock: SharedValue<number>; children: ReactNode }) {
  const opacity = useDerivedValue(() => {
    const t = clock.get();
    return t >= scene.start && (t < scene.end || scene.kind === 'outro') ? 1 : 0;
  });
  return <Group opacity={opacity}>{children}</Group>;
}

/** The interface scene's electric blue room and the faint word behind the card (the card itself is a view, app/edition.tsx). */
function InterfaceGround({ width: W, height: H, type }: { width: number; height: number; type: NonNullable<ReturnType<typeof useReelTypefaces>> }) {
  const big = useMemo(() => fontOf(type.black, W * 0.3), [W, type]);
  const w = useMemo(() => advance(big, 'FOUND'), [big]);
  return (
    <Group>
      <Rect x={0} y={0} width={W} height={H}>
        <RadialGradient c={vec(W * 0.3, H * 0.2)} r={Math.max(W, H) * 1.1} colors={['#4a63ff', '#2440F0', '#1426b8']} positions={[0, 0.45, 1]} />
      </Rect>
      <Text x={(W - w) / 2} y={H / 2 + W * 0.1} text="FOUND" font={big} color="rgba(255,255,255,0.06)" />
    </Group>
  );
}
