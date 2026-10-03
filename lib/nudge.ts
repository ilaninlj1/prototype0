import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { NUDGE } from './nudge-config';

/**
 * Schedule the weekly reminder once. Called after a blind like — the moment
 * the point of "Called it" is clear — so the permission ask makes sense.
 * Best-effort: any failure (web, denied, Expo Go quirks) is silently ignored.
 */
export async function ensureWeeklyNudge(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (scheduled.some((n) => n.identifier === NUDGE.id)) return;
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (perm.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: NUDGE.id,
      content: { title: NUDGE.title, body: NUDGE.body, data: { url: NUDGE.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, ...NUDGE.trigger },
    });
  } catch {
    // ignore
  }
}

/**
 * Points the weekly reminder at new text. Only when notifications are already allowed: this never asks
 * (the ask stays with the first blind like, above). Cancel first, since Expo's docs don't promise that
 * reusing an id replaces the old one.
 */
export async function setWeeklyNudge(content: { title: string; body: string; url: string }): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const current = (await Notifications.getAllScheduledNotificationsAsync()).find((n) => n.identifier === NUDGE.id);
    if (current?.content.title === content.title && current?.content.body === content.body) return;
    await Notifications.cancelScheduledNotificationAsync(NUDGE.id);
    await Notifications.scheduleNotificationAsync({
      identifier: NUDGE.id,
      content: { title: content.title, body: content.body, data: { url: content.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, ...NUDGE.trigger },
    });
  } catch {
    // ignore
  }
}
