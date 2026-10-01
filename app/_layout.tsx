import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from '@expo-google-fonts/figtree';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { CreditLine } from '@/components/credits';
import { SaveFlightLayer } from '@/components/save-flight';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { PlaybackProvider } from '@/hooks/use-playback';
import { startTwinSync } from '@/lib/twins-api';

export const unstable_settings = {
  anchor: '(tabs)',
};

const customTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.accent,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
  },
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export default function RootLayout() {
  // Tapping the weekly "Called it" reminder opens the Liked list.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    startTwinSync(); // Taste Twins members: saves and unsaves follow them to the server
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.url === '/modal') router.push('/modal');
    });
    return () => sub.remove();
  }, []);

  // The public website only serves Blind Pack links. Every other screen uses
  // Last.fm, whose terms need written approval for public web pages.
  const pathname = usePathname();
  const [fontsLoaded] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    DMMono_400Regular,
    DMMono_500Medium,
    PermanentMarker_400Regular,
    Caveat_700Bold,
  });
  if (!fontsLoaded) return <View style={styles.boot} />;
  if (Platform.OS === 'web' && pathname !== '/pack') {
    return (
      <View style={styles.webLanding}>
        <ThemedText type="title">Blindspot</ThemedText>
        <ThemedText style={styles.webText}>
          Blindspot is a phone app for finding music blind. Got a Blind Pack link from a friend? Open it to play here.
        </ThemedText>
        <CreditLine lastfm={false} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ThemeProvider value={customTheme}>
        <PlaybackProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: Colors.surface },
              headerTintColor: Colors.text,
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Liked Tracks' }} />
            <Stack.Screen name="export-history" options={{ presentation: 'modal', title: 'Export History' }} />
            <Stack.Screen name="recently-deleted" options={{ presentation: 'modal', title: 'Recently deleted' }} />
            <Stack.Screen name="drop-play" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="search" options={{ headerShown: false }} />
            <Stack.Screen name="charts" options={{ headerShown: false }} />
            <Stack.Screen name="song" options={{ headerShown: false }} />
            <Stack.Screen name="art" options={{ headerShown: false }} />
            <Stack.Screen name="dj-picks" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="twins" options={{ headerShown: false }} />
            <Stack.Screen name="twin" options={{ headerShown: false }} />
            <Stack.Screen name="songs" options={{ headerShown: false }} />
            <Stack.Screen name="comments" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="pack-send" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="pack" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="blind-test" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="play-spot" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="play-h2h" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="drop-guess" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="drop-results" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          </Stack>
          <SaveFlightLayer />
          <StatusBar style="light" />
        </PlaybackProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: Colors.background },
  webLanding: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  webText: { color: Colors.textSecondary, textAlign: 'center', maxWidth: 420 },
});
