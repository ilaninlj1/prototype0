import { FontAwesome } from '@expo/vector-icons';
import { Linking, StyleSheet, TouchableOpacity } from 'react-native';
import { SvgCss } from 'react-native-svg/css';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { APPLE_MUSIC_BADGE_SVG } from '@/lib/apple-music-badge';
import { appleMusicUrl, CREDIT_LINE, lastfmArtistUrl } from '@/lib/credits';
import { buildSpotifySearchUrl } from '@/lib/discovery';

const open = (url: string) => Linking.openURL(url).catch(() => {});

/** Required source credit — shown wherever previews play. */
export function CreditLine({ lastfm = true }: { lastfm?: boolean }) {
  return (
    <ThemedText type="caption" style={styles.credit}>
      {lastfm ? CREDIT_LINE : 'Previews provided courtesy of iTunes'}
    </ThemedText>
  );
}

/** Apple requires its official badge, linking to the song, next to every revealed preview. */
export function AppleMusicLink({ trackId, url, height = 32 }: { trackId: number; url?: string; height?: number }) {
  return (
    <TouchableOpacity onPress={() => open(appleMusicUrl(trackId, url))} hitSlop={8} accessibilityLabel="Listen on Apple Music">
      <SvgCss xml={APPLE_MUSIC_BADGE_SVG} height={height} width={(height * 140.62) / 41} />
    </TouchableOpacity>
  );
}

/** Last.fm asks for its branded button, linking to the artist page, wherever its counts show. */
export function LastfmLink({ artist }: { artist: string }) {
  return (
    <TouchableOpacity onPress={() => open(lastfmArtistUrl(artist))} style={styles.brandIcon} accessibilityLabel="Open on Last.fm">
      <FontAwesome name="lastfm" size={22} color="#ffffff" />
    </TouchableOpacity>
  );
}

/**
 * Spotify, per its branding rules: the icon alone is allowed where the full
 * logo won't fit; at least 21px; white on a colored (navy) background; clear
 * space of half its height around it; always links to Spotify.
 */
export function SpotifyLink({ artist, title }: { artist: string; title: string }) {
  return (
    <TouchableOpacity
      onPress={() => open(buildSpotifySearchUrl(artist, title))}
      style={styles.spotify}
      accessibilityLabel="Open in Spotify">
      <FontAwesome name="spotify" size={22} color="#ffffff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  spotify: { padding: 11 },
  brandIcon: { padding: 11 },
  credit: { color: Colors.textTertiary, textAlign: 'center', fontSize: 11 },
});
