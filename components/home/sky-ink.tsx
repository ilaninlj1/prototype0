import { createContext, useContext } from 'react';

import { Colors } from '@/constants/theme';

export type SkyInk = {
  text: string;
  secondary: string;
  /** The round buttons and the genre pill. */
  frost: string;
  /** The one big button. */
  main: string;
  mainText: string;
  /** On Home's sky, rather than the plain light look. */
  onSky: boolean;
};

/** Everywhere outside Home: the plain light look. Components that read this look the same as ever there. */
const PLAIN: SkyInk = { text: Colors.text, secondary: Colors.textSecondary, frost: Colors.surface, main: Colors.accent, mainText: Colors.accentText, onSky: false };

export const DARK_WORDS: SkyInk = { text: Colors.text, secondary: 'rgba(17,17,17,0.78)', frost: 'rgba(255,255,255,0.5)', main: Colors.accent, mainText: Colors.accentText, onSky: true };
export const LIGHT_WORDS: SkyInk = { text: '#f3ead8', secondary: 'rgba(243,234,216,0.86)', frost: 'rgba(255,255,255,0.14)', main: '#f3ead8', mainText: '#13213f', onSky: true };

const SkyInkContext = createContext<SkyInk>(PLAIN);

/**
 * Home's words and buttons sit on the sky, so they change with it. This is separate from DarkRoom on purpose: DarkRoom
 * would also flip the sheets that open from these buttons, and those stay light. Only the buttons and words read this.
 */
export const SkyInkProvider = SkyInkContext.Provider;
export const useSkyInk = () => useContext(SkyInkContext);
