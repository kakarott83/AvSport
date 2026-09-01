/**
 * services/notifications/waterReminderService.ts
 *
 * Dünner Wrapper um expo-notifications für die Wasser-Erinnerungen.
 * Die Uhrzeiten kommen aus dem Profil des Nutzers (Zeitfenster + Intervall,
 * siehe lib/waterReminders.ts) und werden als tägliche Notifications geplant.
 * Jeder Fehler wird nur geloggt — das Wasser-Tracking selbst darf nie an
 * einem Notification-Fehler scheitern.
 */

import * as Notifications from 'expo-notifications';

import { buildWaterNotificationContent } from '@/lib/waterNotifications';
import { computeReminderHours, type WaterReminderSettings } from '@/lib/waterReminders';

// ─── Feste Defaults ───────────────────────────────────────────────────────────

const SUGGEST_SIZES_ML = [150, 250, 500];

/** Markiert von diesem Service geplante Notifications, um sie gezielt zu canceln. */
const WATER_TAG = 'water';

// ─── Berechtigungen ───────────────────────────────────────────────────────────

export async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.warn('[WaterReminders] Berechtigungsprüfung fehlgeschlagen:', err);
    return false;
  }
}

// ─── Geplante Erinnerungen ────────────────────────────────────────────────────

async function cancelExistingReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((n) => n.content.data?.tag === WATER_TAG);
  await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/**
 * Cancelt alle bisherigen Wasser-Erinnerungen und plant — sofern im Profil
 * aktiviert — für jede aus `settings` berechnete Uhrzeit eine täglich
 * wiederkehrende Notification. Ist die Funktion deaktiviert oder das
 * Zeitfenster leer, wird nur gecancelt.
 */
export async function syncWaterReminders({
  goalMl, settings,
}: { goalMl: number; settings: WaterReminderSettings }): Promise<void> {
  try {
    await cancelExistingReminders();

    const hours = computeReminderHours(settings);
    if (hours.length === 0) return;

    const granted = await ensurePermission();
    if (!granted) return;

    const body = goalMl > 0
      ? `Denk an dein Wasser — Tagesziel ${goalMl} ml.`
      : 'Denk an dein Wasser.';

    for (const hour of hours) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Zeit zu trinken',
          body,
          data: { tag: WATER_TAG },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: 0,
        },
      });
    }
  } catch (err) {
    console.warn('[WaterReminders] Planen fehlgeschlagen:', err);
  }
}

/** Sofortige Notification, wenn das Tagesziel gerade erreicht wurde. */
export async function sendGoalReachedNotification({ goalMl }: { goalMl: number }): Promise<void> {
  try {
    const granted = await ensurePermission();
    if (!granted) return;

    const content = buildWaterNotificationContent({ remainingMl: 0, goalMl, suggestSizesMl: SUGGEST_SIZES_ML });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: content.title,
        body: content.body,
        data: { tag: WATER_TAG },
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[WaterReminders] Erfolgs-Notification fehlgeschlagen:', err);
  }
}
