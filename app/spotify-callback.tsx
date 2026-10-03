import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { callbackTarget } from '@/lib/spotify';

/**
 * Web only, at blindspot.expo.app/spotify-callback: the one fixed address Spotify's
 * login redirects to. It forwards the login code to the app link carried in the
 * state, but only if that link is this app's (see callbackTarget).
 */
export default function SpotifyCallback() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const target = callbackTarget(window.location.search);
    if (target) window.location.replace(target);
  }, []);
  return (
    <View style={styles.page}>
      <ThemedText type="title">Blindspot</ThemedText>
      <ThemedText style={styles.text}>
        Taking you back to Blindspot… If nothing happens, go back to the app and try again.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md, backgroundColor: Colors.background },
  text: { color: Colors.textSecondary },
});
