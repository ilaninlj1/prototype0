import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

// One family of symbols: 64×64, a 3px cream line, a raised-navy fill, and a
// single red accent. Keep new ones in the same grammar so they read as a set.

type Props = { size?: number };

const LINE = { stroke: Colors.text, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
const FILL = { fill: Colors.surfaceElevated, stroke: Colors.text, strokeWidth: 3, strokeLinejoin: 'round' as const };
const RED = Colors.signal;

/** Head to Head: two headphones crashing, a spark between them. */
export function HeadToHeadEmblem({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <G rotation={-6} origin="20, 34">
        <Path {...LINE} d="M6 36 C6 18 26 16 27 30" />
        <Rect {...FILL} x={3} y={33} width={9} height={15} rx={3} />
        <Rect {...FILL} x={22} y={29} width={8} height={13} rx={3} rotation={-18} origin="26, 35" />
      </G>
      <G rotation={6} origin="44, 34">
        <Path {...LINE} d="M58 36 C58 18 38 16 37 30" />
        <Rect {...FILL} x={52} y={33} width={9} height={15} rx={3} />
        <Rect {...FILL} x={34} y={29} width={8} height={13} rx={3} rotation={18} origin="38, 35" />
      </G>
      <Path fill={RED} d="M32 18 L34.5 27 L43 29.5 L34.5 32 L32 41 L29.5 32 L21 29.5 L29.5 27 Z" />
    </Svg>
  );
}

/** Spot the Star: a spotlight lands on the one star. */
export function SpotTheStarEmblem({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path {...FILL} d="M6 10 L20 6 L23 16 L9 20 Z" />
      <Path fill={RED} opacity={0.18} d="M21 13 L58 38 L42 58 L14 18 Z" />
      <Path {...LINE} d="M21 13 L58 38 M14 18 L42 58" />
      <Path fill={RED} d="M44 32 L47 40 L56 40.5 L49 46 L51.5 54.5 L44 49.5 L36.5 54.5 L39 46 L32 40.5 L41 40 Z" />
    </Svg>
  );
}

/** Blind Spot Test: an eye with a blindfold tied across it. */
export function BlindTestEmblem({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path {...FILL} d="M4 32 C14 16 50 16 60 32 C50 48 14 48 4 32 Z" />
      <Circle {...LINE} cx={32} cy={32} r={7} />
      <Path fill={RED} d="M2 26 L62 22 L62 34 L2 38 Z" />
      <Path stroke={RED} strokeWidth={3} strokeLinecap="round" fill="none" d="M60 28 L58 42 M60 28 L64 40" />
    </Svg>
  );
}

/** Daily Drop: a record dropping in. */
export function DailyDropEmblem({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path stroke={RED} strokeWidth={3} strokeLinecap="round" fill="none" d="M14 8 L14 16 M22 4 L22 12 M30 8 L30 16" />
      <Circle {...FILL} cx={34} cy={38} r={22} />
      <Circle {...LINE} cx={34} cy={38} r={14} opacity={0.5} />
      <Circle fill={RED} cx={34} cy={38} r={8} />
      <Circle fill={Colors.background} cx={34} cy={38} r={2} />
    </Svg>
  );
}

/** Blind Pack: a cassette tied with a ribbon, a mixtape gift. */
export function BlindPackEmblem({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect {...FILL} x={4} y={16} width={56} height={36} rx={4} />
      <Rect {...LINE} x={14} y={26} width={36} height={12} rx={6} />
      <Circle {...LINE} cx={22} cy={32} r={3} />
      <Circle {...LINE} cx={42} cy={32} r={3} />
      <Rect fill={RED} x={29} y={12} width={6} height={44} />
      <Path fill={RED} d="M32 14 C24 2 16 8 26 14 Z M32 14 C40 2 48 8 38 14 Z" />
    </Svg>
  );
}

/** The app mark: headphones wearing a blindfold. */
export function BlindspotMark({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path {...LINE} d="M10 40 C10 12 54 12 54 40" />
      <Rect {...FILL} x={6} y={36} width={12} height={20} rx={4} />
      <Rect {...FILL} x={46} y={36} width={12} height={20} rx={4} />
      <Path fill={RED} d="M4 30 L60 26 L60 36 L4 40 Z" />
    </Svg>
  );
}

/** World Charts: a globe with sound coming off it. */
export function WorldChartsEmblem({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle {...FILL} cx={28} cy={34} r={22} />
      <Path {...LINE} d="M6 34 H50 M28 12 C18 22 18 46 28 56 M28 12 C38 22 38 46 28 56" opacity={0.7} />
      <Path stroke={RED} strokeWidth={3} strokeLinecap="round" fill="none" d="M52 14 C56 18 56 24 52 28 M57 9 C64 16 64 26 57 33" />
    </Svg>
  );
}
