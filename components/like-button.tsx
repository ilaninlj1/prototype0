import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, TouchableOpacity } from 'react-native';

import { Colors } from '@/constants/theme';
import type { DiscoveryTrack } from '@/lib/discovery';
import { appendLikedTrack, loadLikedTracks, saveLikedTracks } from '@/lib/discovery-storage';
import { ensureWeeklyNudge } from '@/lib/nudge';

/** Save any revealed song to Liked (and take it back out). Phone app only — the web pack page has no Liked list. */
export function LikeButton({ track, size = 22 }: { track: DiscoveryTrack; size?: number }) {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    loadLikedTracks().then((all) => setLiked(all.some((t) => t.id === track.id)));
  }, [track.id]);

  async function toggle() {
    if (liked) {
      const all = await loadLikedTracks();
      await saveLikedTracks(all.filter((t) => t.id !== track.id));
      setLiked(false);
    } else {
      await appendLikedTrack({ ...track, likedAt: Date.now() });
      setLiked(true);
      ensureWeeklyNudge();
    }
  }

  if (Platform.OS === 'web') return null;
  return (
    <TouchableOpacity onPress={toggle} hitSlop={10} accessibilityLabel={liked ? 'Remove from Liked' : 'Add to Liked'}>
      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? Colors.accent : Colors.textSecondary} />
    </TouchableOpacity>
  );
}
