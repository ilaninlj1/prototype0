import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet } from 'react-native';

import { saveLike } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, Ui } from '@/constants/theme';
import { useCalledShots } from '@/hooks/use-called-shots';
import { callAction, nextCallChange } from '@/lib/called-shots';
import type { DiscoveryTrack } from '@/lib/discovery';
import { loadLikedTracks, toggleStoredCall } from '@/lib/discovery-storage';

type Props = {
  track: DiscoveryTrack;
  listeners: number | null | undefined;
  onSave?: (track: DiscoveryTrack) => Promise<void>;
};

export function CallButton({ track, listeners, onSave = saveLike }: Props) {
  const { calls, loaded } = useCalledShots();
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setTimeout(refresh, Math.max(1, nextCallChange(calls, now) - Date.now()));
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [calls, now]);

  const action = callAction(calls, track.id, now);
  const disabled = !loaded || busy || action === 'locked' || action === 'limit' || (action === 'call' && listeners === undefined);
  const label = action === 'limit' ? '3 calls this week' : action === 'take-back' ? 'Take back' : action === 'locked' ? 'Called' : 'Call it';

  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const calledAt = Date.now();
    try {
      await toggleStoredCall({
        trackId: track.id,
        trackName: track.trackName,
        artistName: track.artistName,
        artistId: track.artistId,
        listenersAtCall: listeners ?? null,
        calledAt,
      }, async () => {
        const liked = await loadLikedTracks();
        if (!liked.some((t) => t.id === track.id)) {
          await onSave({ ...track, artistListeners: listeners ?? undefined });
        }
      });
    } finally {
      pending.current = false;
      setBusy(false);
      setNow(Date.now());
    }
  }

  return (
    <Pressable
      style={[styles.button, disabled && styles.disabled]}
      disabled={disabled}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={action === 'take-back' ? 'Take back today’s call' : label}
      accessibilityState={{ disabled, busy }}>
      <ThemedText style={styles.label}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Outlined, so Next stays the main action on the reveal.
  button: { ...Ui.outlineButton, flex: 1, paddingHorizontal: Spacing.xs },
  label: { ...Ui.label, color: Colors.text, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
