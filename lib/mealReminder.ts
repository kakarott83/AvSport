/**
 * Pure helpers for the daily "log your meals" reminder.
 * No React, no expo-notifications — safe to unit-test directly.
 */

export interface MealReminderSettings {
  enabled: boolean;
  /** 0–23 */
  hour: number;
  /** 0–59 */
  minute: number;
}

export const DEFAULT_MEAL_REMINDER_SETTINGS: MealReminderSettings = {
  enabled: false,
  hour: 20,
  minute: 0,
};

/** Bounds for the two profile steppers (minutes in 15-minute steps). */
export const MEAL_REMINDER_BOUNDS = {
  hour:   { min: 0, max: 23, step: 1 },
  minute: { min: 0, max: 45, step: 15 },
} as const;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Clamps raw profile values into a valid schedule. */
export function sanitizeMealReminderSettings(
  raw: Partial<MealReminderSettings> | null | undefined,
): MealReminderSettings {
  return {
    enabled: raw?.enabled === true,
    hour: clamp(raw?.hour, 0, 23, DEFAULT_MEAL_REMINDER_SETTINGS.hour),
    minute: clamp(raw?.minute, 0, 59, DEFAULT_MEAL_REMINDER_SETTINGS.minute),
  };
}

/** "20:00" / "07:45" */
export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
