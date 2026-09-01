/**
 * Pure decision logic for cycle notifications.
 * No React, no expo-notifications — safe to unit-test directly.
 *
 * The user opts in to two reminders in their profile:
 *   - "period"  → one day before the predicted next period start
 *   - "fertile" → one day before the fertile window opens (ovulation − 3)
 *
 * Both fire at REMINDER_HOUR local time. `planCycleReminders` turns the
 * predictions from lib/cycle.ts into the concrete list of notifications to
 * schedule; the thin service wrapper only cancels + (re)schedules them.
 */

import {
  addDays,
  diffDays,
  FERTILE_WINDOW_RADIUS_DAYS,
  type UpcomingEvent,
} from '@/lib/cycle';

// ─────────────────────────────────────────────────────────────────────────────

export const REMINDER_LEAD_DAYS = 1;
export const REMINDER_HOUR = 9;

export interface CycleReminderSettings {
  periodEnabled: boolean;
  fertileEnabled: boolean;
}

export type CycleReminderKind = 'period' | 'fertile';

export interface ScheduledCycleReminder {
  kind: CycleReminderKind;
  /** ISO date the notification should fire on (at REMINDER_HOUR local). */
  fireDate: string;
  /** ISO date of the event the reminder is about. */
  eventDate: string;
  title: string;
  body: string;
}

export const DEFAULT_CYCLE_REMINDER_SETTINGS: CycleReminderSettings = {
  periodEnabled: false,
  fertileEnabled: false,
};

export function sanitizeCycleReminderSettings(
  raw: Partial<CycleReminderSettings> | null | undefined,
): CycleReminderSettings {
  return {
    periodEnabled: !!raw?.periodEnabled,
    fertileEnabled: !!raw?.fertileEnabled,
  };
}

/**
 * Which cycle reminders to schedule, given the current predictions.
 *
 * A reminder is only returned when it is enabled AND its fire date is still in
 * the future (`> today`) — a same-day or past reminder is dropped.
 */
export function planCycleReminders(input: {
  settings: Partial<CycleReminderSettings> | null | undefined;
  nextPeriod: UpcomingEvent | null;
  nextOvulation: UpcomingEvent | null;
  today: string;
}): ScheduledCycleReminder[] {
  const settings = sanitizeCycleReminderSettings(input.settings);
  const out: ScheduledCycleReminder[] = [];

  if (settings.periodEnabled && input.nextPeriod) {
    const fireDate = addDays(input.nextPeriod.date, -REMINDER_LEAD_DAYS);
    if (diffDays(input.today, fireDate) > 0) {
      out.push({
        kind: 'period',
        fireDate,
        eventDate: input.nextPeriod.date,
        title: 'Deine Periode steht bevor',
        body: 'Voraussichtlich beginnt deine Periode morgen. Denk an deine Vorbereitung. 🩸',
      });
    }
  }

  if (settings.fertileEnabled && input.nextOvulation) {
    const windowStart = addDays(input.nextOvulation.date, -FERTILE_WINDOW_RADIUS_DAYS);
    const fireDate = addDays(windowStart, -REMINDER_LEAD_DAYS);
    if (diffDays(input.today, fireDate) > 0) {
      out.push({
        kind: 'fertile',
        fireDate,
        eventDate: windowStart,
        title: 'Fruchtbares Fenster beginnt bald',
        body: 'Ab morgen beginnt dein fruchtbares Fenster rund um den Eisprung. 🌱',
      });
    }
  }

  return out;
}

/** Short human-readable summary for the profile screen. */
export function describeCycleReminders(
  settings: Partial<CycleReminderSettings> | null | undefined,
): string {
  const s = sanitizeCycleReminderSettings(settings);
  const parts: string[] = [];
  if (s.periodEnabled) parts.push('Perioden-Start');
  if (s.fertileEnabled) parts.push('fruchtbares Fenster');
  if (parts.length === 0) return 'Keine Zyklus-Erinnerungen aktiv.';
  return `Erinnerung 1 Tag vorher: ${parts.join(' & ')}.`;
}
