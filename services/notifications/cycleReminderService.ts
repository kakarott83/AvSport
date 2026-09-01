/**
 * services/notifications/cycleReminderService.ts
 *
 * Dünner Wrapper um expo-notifications für die Zyklus-Erinnerungen
 * (Perioden-Start, fruchtbares Fenster). Welche Notifications geplant werden,
 * entscheidet die reine Logik in lib/cycleReminders.ts. Bei jedem Sync werden
 * die bisherigen Zyklus-Notifications gecancelt und neu geplant — idempotent.
 *
 * Jeder Fehler wird nur geloggt; das Zyklus-Tracking darf nie an einem
 * Notification-Fehler scheitern.
 */

import * as Notifications from 'expo-notifications';

import type { UpcomingEvent } from '@/lib/cycle';
import {
  planCycleReminders,
  REMINDER_HOUR,
  type CycleReminderSettings,
} from '@/lib/cycleReminders';

/** Markiert von diesem Service geplante Notifications, um sie gezielt zu canceln. */
const CYCLE_TAG = 'cycle';

async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.warn('[CycleReminders] Berechtigungsprüfung fehlgeschlagen:', err);
    return false;
  }
}

async function cancelExisting(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((n) => n.content.data?.tag === CYCLE_TAG);
  await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

function fireAt(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, REMINDER_HOUR, 0, 0, 0);
}

export async function syncCycleReminders(input: {
  settings: CycleReminderSettings;
  nextPeriod: UpcomingEvent | null;
  nextOvulation: UpcomingEvent | null;
  today: string;
}): Promise<void> {
  try {
    await cancelExisting();

    const reminders = planCycleReminders(input);
    if (reminders.length === 0) return;

    const granted = await ensurePermission();
    if (!granted) return;

    for (const reminder of reminders) {
      const date = fireAt(reminder.fireDate);
      if (date.getTime() <= Date.now()) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.title,
          body: reminder.body,
          data: { tag: CYCLE_TAG, kind: reminder.kind },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
  } catch (err) {
    console.warn('[CycleReminders] Planen fehlgeschlagen:', err);
  }
}
