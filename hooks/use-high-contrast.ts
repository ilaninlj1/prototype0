import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** The phone's Increase Contrast setting (iPhone) or High Contrast Text (Android). Always false on the web. */
export function useHighContrast(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    const ask = Platform.OS === 'ios' ? AccessibilityInfo.isDarkerSystemColorsEnabled : AccessibilityInfo.isHighTextContrastEnabled;
    ask?.()
      .then((enabled) => {
        if (live) setOn(!!enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(Platform.OS === 'ios' ? 'darkerSystemColorsChanged' : 'highTextContrastChanged', setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}
