import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { PlaybackProvider } from '@/hooks/use-playback';

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
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.url === '/modal') router.push('/modal');
    });
    return () => sub.remove();
  }, []);

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
            <Stack.Screen name="drop-play" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="blind-test" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="play-spot" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="play-h2h" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="drop-guess" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="drop-results" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="spike-test" options={{ presentation: 'modal', title: 'Spike Test' }} />
          </Stack>
          <StatusBar style="light" />
        </PlaybackProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}