/**
 * Pure nutrition-calculation helpers.
 * No React, no React Native — safe to import from tests and server code.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type FoodLog = {
  id: string;
  meal_name: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  created_at: string;
};

export type WeekDay = { date: string; eaten: number; label: string };

export type DayTotals = {
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

// ── Functions ──────────────────────────────────────────────────────────────────

/**
 * Aggregate today's food logs into macro totals.
 * - `calories` is kept as the raw integer sum (no rounding needed — comes in as int).
 * - Macro grams are rounded to the nearest integer.
 * - null macro fields are treated as 0.
 */
export function computeDayTotals(logs: FoodLog[]): DayTotals {
  return {
    totalKcal:    logs.reduce((s, l) => s + l.calories, 0),
    totalProtein: Math.round(logs.reduce((s, l) => s + (l.protein ?? 0), 0)),
    totalCarbs:   Math.round(logs.reduce((s, l) => s + (l.carbs   ?? 0), 0)),
    totalFat:     Math.round(logs.reduce((s, l) => s + (l.fat     ?? 0), 0)),
  };
}

/** Remaining kcal = goal − eaten (negative = exceeded). */
export function computeRemaining(goal: number, eaten: number): number {
  return goal - eaten;
}

/**
 * Build the 7-day rolling chart data, from 6 days ago to today.
 * Days not present in `dayMap` get 0 eaten.
 * The last entry (today) is always labelled 'Heute'.
 */
export function buildWeekDays(dayMap: Record<string, number>): WeekDay[] {
  const DE_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return Array.from({ length: 7 }, (_, i) => {
    const d   = new Date(Date.now() - (6 - i) * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    return {
      date:  iso,
      eaten: dayMap[iso] ?? 0,
      label: i === 6 ? 'Heute' : DE_LABELS[d.getDay()],
    };
  });
}
