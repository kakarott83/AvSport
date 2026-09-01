/**
 * Pure helpers for the water-reminder schedule.
 * No React, no expo-notifications — safe to unit-test directly.
 *
 * The user configures a daily time window (start/end hour) and an interval in
 * hours in their profile. `computeReminderHours` turns that into the concrete
 * clock hours at which a reminder should fire every day.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WaterReminderSettings {
  enabled: boolean;
  /** First reminder of the day, 0–23. */
  startHour: number;
  /** No reminder is scheduled after this hour, 0–23. */
  endHour: number;
  /** Hours between reminders, >= 1. */
  intervalHours: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_WATER_REMINDER_SETTINGS: WaterReminderSettings = {
  enabled: false,
  startHour: 8,
  endHour: 20,
  intervalHours: 2,
};

/** Authoritative bounds for the three profile steppers. */
export const WATER_REMINDER_BOUNDS = {
  startHour:     { min: 4,  max: 12, step: 1 },
  endHour:       { min: 14, max: 23, step: 1 },
  intervalHours: { min: 1,  max: 6,  step: 1 },
} as const;

/** Hard safety cap so a tiny interval can never flood the notification queue. */
export const MAX_REMINDERS_PER_DAY = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 0;
  return Math.min(23, Math.max(0, Math.round(h)));
}

/**
 * Clamps raw (possibly out-of-range or non-integer) settings into a sane,
 * internally-consistent shape. `endHour` is forced to be >= `startHour`.
 */
export function sanitizeWaterReminderSettings(
  raw: Partial<WaterReminderSettings> | null | undefined,
): WaterReminderSettings {
  const base = { ...DEFAULT_WATER_REMINDER_SETTINGS, ...(raw ?? {}) };
  const startHour = clampHour(base.startHour);
  const endHour = Math.max(startHour, clampHour(base.endHour));
  const intervalHours = Math.min(12, Math.max(1, Math.round(base.intervalHours) || 1));
  return { enabled: !!base.enabled, startHour, endHour, intervalHours };
}

/**
 * The concrete clock hours (0–23) at which a reminder fires every day.
 *
 * Walks from `startHour` in `intervalHours` steps up to and including
 * `endHour`. Returns `[]` when reminders are disabled. Capped at
 * MAX_REMINDERS_PER_DAY.
 */
export function computeReminderHours(
  raw: Partial<WaterReminderSettings> | null | undefined,
): number[] {
  const s = sanitizeWaterReminderSettings(raw);
  if (!s.enabled) return [];

  const hours: number[] = [];
  for (let h = s.startHour; h <= s.endHour && hours.length < MAX_REMINDERS_PER_DAY; h += s.intervalHours) {
    hours.push(h);
  }
  return hours;
}

/**
 * Short human-readable summary for the profile screen, e.g.
 * "Alle 2 h zwischen 08:00 und 20:00 Uhr (7×)".
 */
export function describeReminderSchedule(
  raw: Partial<WaterReminderSettings> | null | undefined,
): string {
  const s = sanitizeWaterReminderSettings(raw);
  if (!s.enabled) return 'Erinnerungen sind ausgeschaltet.';
  const count = computeReminderHours(s).length;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Alle ${s.intervalHours} h zwischen ${pad(s.startHour)}:00 und ${pad(s.endHour)}:00 Uhr (${count}×).`;
}
