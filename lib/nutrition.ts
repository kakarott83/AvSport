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

// ── Vorschläge für "Tag erfassen" ──────────────────────────────────────────────

/** Ein bereits erfasstes Gericht als Vorlage (Werte = letzte Erfassung, 1 Portion). */
export type MealSuggestion = {
  key:      string; // normalisierter Name, eindeutig
  name:     string;
  calories: number;
  protein:  number | null;
  carbs:    number | null;
  fat:      number | null;
  count:    number; // wie oft erfasst
  lastAt:   string; // ISO-Zeitpunkt der letzten Erfassung
};

export type MealHistoryEntry = Omit<FoodLog, 'id'>;

const normalizeMealName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Fasst bisherige Erfassungen zu Gericht-Vorschlägen zusammen:
 * gleiche Namen (ohne Groß-/Kleinschreibung) werden gezählt, die Nährwerte
 * stammen aus der jüngsten Erfassung. Sortiert nach Häufigkeit, dann Aktualität.
 */
export function buildMealSuggestions(history: MealHistoryEntry[], limit = 40): MealSuggestion[] {
  const map = new Map<string, MealSuggestion>();
  for (const h of history) {
    const name = h.meal_name?.trim();
    if (!name || !(h.calories > 0)) continue;
    const key = normalizeMealName(name);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { key, name, calories: h.calories, protein: h.protein, carbs: h.carbs, fat: h.fat, count: 1, lastAt: h.created_at });
      continue;
    }
    prev.count++;
    if (h.created_at > prev.lastAt) {
      Object.assign(prev, { name, calories: h.calories, protein: h.protein, carbs: h.carbs, fat: h.fat, lastAt: h.created_at });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
}

/** Skaliert ein Gericht auf `factor` Portionen (kcal ganzzahlig, Makros auf 0,1 g). */
export function scaleMeal(
  meal: Pick<MealSuggestion, 'calories' | 'protein' | 'carbs' | 'fat'>,
  factor: number,
): { calories: number; protein: number | null; carbs: number | null; fat: number | null } {
  const g = (v: number | null) => (v == null ? null : Math.round(v * factor * 10) / 10);
  return {
    calories: Math.round(meal.calories * factor),
    protein:  g(meal.protein),
    carbs:    g(meal.carbs),
    fat:      g(meal.fat),
  };
}
