import { useEffect, useState } from 'react';

import { soundFor } from '@/lib/sound-index';
import { soundLookup } from '@/lib/sound-lookup-app';
import type { Lookupable } from '@/lib/sound-lookup';
import type { SoundRecord } from '@/lib/sound';

/** A song's sound: the bundled index first, then the phone's cache, then a live lookup. */
export function useSound(track: Lookupable | null | undefined): { record: SoundRecord | null; loading: boolean } {
  const id = track?.id;
  const indexed = id != null ? soundFor(id) : null;
  const [state, setState] = useState<{ id?: number; record: SoundRecord | null; loading: boolean }>({ record: null, loading: false });

  useEffect(() => {
    if (!track || indexed) return;
    let cancelled = false;
    setState({ id: track.id, record: soundLookup.peek(track.id), loading: true });
    soundLookup.lookup(track).then((record) => {
      if (!cancelled) setState({ id: track.id, record, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // The track's id decides what to look up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!indexed]);

  if (indexed) return { record: { status: 'measured', features: indexed, source: 'index', at: 0 }, loading: false };
  // A result for a previous card never shows on this one.
  if (state.id !== id) return { record: null, loading: !!track };
  return { record: state.record, loading: state.loading };
}
