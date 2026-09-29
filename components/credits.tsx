import { Linking, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { appleMusicUrl, CREDIT_LINE, lastfmArtistUrl } from '@/lib/credits';

const open = (url: string) => Linking.openURL(url).catch(() => {});

/** Required source credit — shown wherever previews play. */
export function CreditLine({ lastfm = true }: { lastfm?: boolean }) {
  return (
    <ThemedText type="caption" style={styles.credit}>
      {lastfm ? CREDIT_LINE : 'Previews provided courtesy of iTunes'}
    </ThemedText>
  );
}

/** Apple requires a link to the song next to every revealed preview. */
export function AppleMusicLink({ trackId, url }: { trackId: number; url?: string }) {
  return (
    <TouchableOpacity onPress={() => open(appleMusicUrl(trackId, url))} hitSlop={8}>
      <ThemedText type="link" style={styles.link}>
        Listen on Apple Music ↗
      </ThemedText>
    </TouchableOpacity>
  );
}

/** Last.fm requires links to its artist page wherever its listener counts show. */
export function LastfmLink({ artist }: { artist: string }) {
  return (
    <TouchableOpacity onPress={() => open(lastfmArtistUrl(artist))} hitSlop={8}>
      <ThemedText type="link" style={styles.link}>
        Last.fm ↗
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  credit: { color: Colors.textTertiary, textAlign: 'center', fontSize: 11 },
  link: { fontSize: 13 },
});
