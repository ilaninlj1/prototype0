import { Skia, useTypeface, type SkFont, type SkTypeface } from '@shopify/react-native-skia';

// The reel's type for Skia: Inter Tight Black and Bold, Parisienne for the
// script line, DM Mono for small labels. Null until all four have loaded.

export type ReelTypefaces = { black: SkTypeface; bold: SkTypeface; script: SkTypeface; mono: SkTypeface };

export function useReelTypefaces(): ReelTypefaces | null {
  const black = useTypeface(require('@expo-google-fonts/inter-tight/900Black/InterTight_900Black.ttf'));
  const bold = useTypeface(require('@expo-google-fonts/inter-tight/700Bold/InterTight_700Bold.ttf'));
  const script = useTypeface(require('@expo-google-fonts/parisienne/400Regular/Parisienne_400Regular.ttf'));
  const mono = useTypeface(require('@expo-google-fonts/dm-mono/400Regular/DMMono_400Regular.ttf'));
  return black && bold && script && mono ? { black, bold, script, mono } : null;
}

export const fontOf = (face: SkTypeface, size: number): SkFont => Skia.Font(face, size);

/** How far the pen moves for this text: the sum of its glyphs' advances. */
export function advance(font: SkFont, text: string): number {
  return font.getGlyphWidths(font.getGlyphIDs(text)).reduce((a, w) => a + w, 0);
}
