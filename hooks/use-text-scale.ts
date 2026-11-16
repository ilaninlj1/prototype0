import { Platform, useWindowDimensions } from 'react-native';

import { textScaleFromQuery } from '@/lib/text-scale';

/** The web's stand-in for the phone's text size setting: ?textScale=3.1 in the address. */
export const WEB_TEXT_SCALE =
  Platform.OS === 'web' ? textScaleFromQuery((globalThis as { location?: { search?: string } }).location?.search) : 1;

/** The phone's text size setting, where 1 is the default and about 3.1 is iPhone's biggest. */
export function useTextScale(): number {
  const { fontScale } = useWindowDimensions();
  return Platform.OS === 'web' ? WEB_TEXT_SCALE : fontScale;
}
