import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { CalledShot } from '@/lib/called-shots';
import { loadCalls, onCallsChange } from '@/lib/discovery-storage';

export function useCalledShots() {
  const [calls, setCalls] = useState<CalledShot[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let changed = false;
    const unsubscribe = onCallsChange((next) => {
      changed = true;
      setCalls(next);
      setLoaded(true);
    });
    loadCalls().then((next) => {
      if (cancelled || changed) return;
      setCalls(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []));

  return { calls, loaded };
}
