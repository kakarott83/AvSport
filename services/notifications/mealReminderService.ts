/**
 * services/notifications/mealReminderService.ts
 *
 * Tägliche Erinnerung, die Mahlzeiten des Tages zu erfassen (Profil →
 * Mahlzeiten-Erinnerung). Ein Tippen auf die Mitteilung öffnet "Tag erfassen"
 * im Ernährungs-Tab (siehe app/(app)/_layout.tsx). Fehler werden nur geloggt.
 */

import * as Notifications from 'expo-notifications';

import { t } from '@/lib/i18n';
import type { MealReminderSettings } from '@/lib/mealReminder';
import { ensurePermission } from '@/services/notifications/waterReminderService';

/** Markiert die Mahlzeiten-Erinnerung, um sie gezielt zu canceln / beim Tippen zu erkennen. */
export const MEAL_REMINDER_TAG = 'meal';

async function cancelExisting(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((n) => n.content.data?.tag === MEAL_REMINDER_TAG);
  await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/**
 * Cancelt die bisherige Mahlzeiten-Erinnerung und plant sie — falls aktiviert —
 * täglich zur gewählten Uhrzeit neu.
 */
export async function syncMealReminder(settings: MealReminderSettings): Promise<void> {
  try {
    await cancelExisting();
    if (!settings.enabled) return;

    const granted = await ensurePermission();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('domain.mealNotification.title'),
        body: t('domain.mealNotification.body'),
        data: { tag: MEAL_REMINDER_TAG },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: settings.hour,
        minute: settings.minute,
      },
    });
  } catch (err) {
    console.warn('[MealReminder] Planen fehlgeschlagen:', err);
  }
}
