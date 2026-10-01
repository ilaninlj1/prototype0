import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, TouchableOpacity } from 'react-native';

import { Colors } from '@/constants/theme';
import type { DiscoveryTrack } from '@/lib/discovery';
import { appendLikedTrack, deleteLikedTracks, loadLikedTracks, restoreDeletedTracks } from '@/lib/discovery-storage';
import { ensureWeeklyNudge } from '@/lib/nudge';
import { fetchArtistListeners } from '@/lib/pool';

// Every heart on screen listens here, so a double-tap anywhere fills them in.
const listeners = new Set<(id: number, liked: boolean) => void>();
function announce(id: number, liked: boolean) {
  listeners.forEach((fn) => fn(id, liked));
}

/** Hear about every save and unsave, wherever it happens. Returns an unsubscribe. */
export function onLikeChange(fn: (id: number, liked: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Save a song to Liked (idempotent) — used by hearts and double-taps alike. */
export async function saveLike(track: DiscoveryTrack): Promise<void> {
  const likedAt = track.likedAt ?? Date.now();
  // "Called it" needs the listener count at the moment you found it.
  const found = track.artistListeners ?? (await fetchArtistListeners(track.artistName)) ?? undefined;
  await appendLikedTrack({ ...track, artistListeners: found, likedAt });
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  announce(track.id, true);
  ensureWeeklyNudge();
}

// Taking the heart off moves the song to Recently deleted, so it can come back.
async function removeLike(id: number): Promise<void> {
  await deleteLikes([id]);
}

/** Move songs from Liked to Recently deleted, and tell every heart. */
export async function deleteLikes(ids: number[]): Promise<void> {
  await deleteLikedTracks(ids);
  ids.forEach((id) => announce(id, false));
}

/** Put songs from Recently deleted back into Liked, and tell every heart. */
export async function restoreLikes(ids: number[]): Promise<void> {
  await restoreDeletedTracks(ids);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  ids.forEach((id) => announce(id, true));
}

/** Save any revealed song to Liked (and take it back out). Phone app only — the web pack page has no Liked list. */
export function LikeButton({ track, size = 22 }: { track: DiscoveryTrack; size?: number }) {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    loadLikedTracks().then((all) => setLiked(all.some((t) => t.id === track.id)));
    const onChange = (id: number, value: boolean) => id === track.id && setLiked(value);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [track.id]);

  if (Platform.OS === 'web') return null;
  return (
    <TouchableOpacity
      onPress={() => (liked ? removeLike(track.id) : saveLike(track))}
      hitSlop={10}
      accessibilityLabel={liked ? 'Remove from Liked' : 'Add to Liked'}>
      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? Colors.signal : Colors.textSecondary} />
    </TouchableOpacity>
  );
}
