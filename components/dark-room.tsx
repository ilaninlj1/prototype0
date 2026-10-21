import { createContext, useContext, type ReactNode } from 'react';

const DarkRoomContext = createContext(false);

/**
 * Inside, ThemedText and ThemedView default to the navy set (DarkColors): the
 * blind card, the Edition, the Dark Map and Rewind are dark on purpose in an
 * otherwise light app.
 */
export function DarkRoom({ children }: { children: ReactNode }) {
  return <DarkRoomContext.Provider value={true}>{children}</DarkRoomContext.Provider>;
}

export const useDarkRoom = () => useContext(DarkRoomContext);
