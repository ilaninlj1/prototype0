import { setStatusBarStyle } from 'expo-status-bar';
import { useEffect } from 'react';

/** The dark experiences (Edition, Dark Map, Rewind) sit on navy: a light status bar while one is open, dark again after. */
export function useLightStatusBar() {
  useEffect(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, []);
}
