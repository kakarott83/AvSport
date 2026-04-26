/**
 * Pure step-goal calculation utilities.
 * No React, no React Native — safe to import from tests and hooks alike.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "active"
  | "very_active";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** German display labels for each activity level. */
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary:  "Sitzend",
  light:      "Leicht aktiv",
  active:     "Aktiv",
  very_active: "Sehr aktiv",
};

/** All four activity levels in display order. */
export const ACTIVITY_LEVELS: ActivityLevel[] = [
  "sedentary",
  "light",
  "active",
  "very_active",
];

/** Base steps for every user (minimum daily target). */
export const BASE_STEPS = 5_000;

/** Additional steps added on top of BASE_STEPS per activity level. */
export const ACTIVITY_BONUS: Record<ActivityLevel, number> = {
  sedentary:  0,
  light:      2_000,
  active:     5_000,
  very_active: 10_000,
};

/** Default activity level when no profile data is available yet. */
export const DEFAULT_ACTIVITY_LEVEL: ActivityLevel = "light";

// ─────────────────────────────────────────────────────────────────────────────
// Calculation functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the daily step goal for a given activity level.
 *
 * If `manualStepGoal` is provided and > 0 the automatic calculation is
 * skipped and the manual value is returned unchanged.
 *
 * Activity level → goal:
 *   sedentary   →  5 000  (base only)
 *   light       →  7 000  (base + 2 000)
 *   active      → 10 000  (base + 5 000)
 *   very_active → 15 000  (base + 10 000)
 */
export function calculateDailyStepGoal(
  activityLevel: ActivityLevel,
  manualStepGoal?: number | null,
): number {
  if (manualStepGoal != null && manualStepGoal > 0) {
    return manualStepGoal;
  }
  return BASE_STEPS + ACTIVITY_BONUS[activityLevel];
}

/**
 * Estimated calorie burn per single step based on body weight.
 * Formula: weight_kg × 0.0005  (rough average for an adult walking pace).
 *
 * Returns 0 when weightKg is falsy to avoid division/NaN in callers.
 */
export function calculateKcalPerStep(weightKg: number | null | undefined): number {
  if (!weightKg || weightKg <= 0) return 0;
  return weightKg * 0.0005;
}

/**
 * Estimated total calorie burn for a given step count and body weight.
 * Rounds to the nearest whole kcal.
 */
export function stepsToWeightedKcal(
  steps: number,
  weightKg: number | null | undefined,
): number {
  return Math.round(steps * calculateKcalPerStep(weightKg));
}
