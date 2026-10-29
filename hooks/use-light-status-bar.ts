import { setStatusBarStyle } from 'expo-status-bar';
import { useEffect } from 'react';

/**
 * The dark experiences (Edition, Dark Map, Rewind, Run's live screen) sit on
 * navy or black: a light status bar while one is open, dark again after.
 * `on` lets a screen that's only sometimes dark (Run) switch it.
 */
export function useLightStatusBar(on = true) {
  useEffect(() => {
    if (!on) return;
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, [on]);
}
