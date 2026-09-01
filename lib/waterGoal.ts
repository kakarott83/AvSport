/**
 * Pure water-goal calculation utilities.
 * No React, no network — safe to import from tests and hooks alike.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum sensible daily water goal in ml, regardless of weight. */
export const MIN_WATER_GOAL_ML = 1200;

/** ml of water suggested per kg of body weight. */
export const ML_PER_KG = 35;

/** Fallback goal when neither a manual value nor a body weight is known. */
export const DEFAULT_WATER_GOAL_ML = 2000;

/**
 * Extra ml added to the weight-based estimate per activity level — more
 * movement means more sweat loss to replace. Keyed by the same strings as
 * `ActivityLevel` in lib/stepGoal.ts; an unknown key contributes 0.
 */
export const ACTIVITY_WATER_BONUS_ML: Record<string, number> = {
  sedentary:   0,
  light:       250,
  active:      500,
  very_active: 750,
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WaterGoalSource = 'user' | 'estimate';

export interface WaterGoalResult {
  goalMl: number;
  source: WaterGoalSource;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the daily water goal.
 *
 * A manual override (`manualGoalMl`, e.g. set by the user in their profile)
 * always wins. Otherwise the goal is estimated from body weight
 * (`weightKg * ML_PER_KG`) plus an activity bonus
 * (`ACTIVITY_WATER_BONUS_ML[activityLevel]`), floored at MIN_WATER_GOAL_ML.
 * If the weight is also unknown, DEFAULT_WATER_GOAL_ML is used.
 */
export function calculateWaterGoal(
  weightKg: number | null | undefined,
  manualGoalMl: number | null | undefined,
  activityLevel?: string | null,
): WaterGoalResult {
  if (manualGoalMl != null && manualGoalMl > 0) {
    return { goalMl: manualGoalMl, source: 'user' };
  }
  if (weightKg != null && weightKg > 0) {
    const activityBonus = activityLevel ? (ACTIVITY_WATER_BONUS_ML[activityLevel] ?? 0) : 0;
    const estimate = Math.round(weightKg * ML_PER_KG) + activityBonus;
    return { goalMl: Math.max(MIN_WATER_GOAL_ML, estimate), source: 'estimate' };
  }
  return { goalMl: DEFAULT_WATER_GOAL_ML, source: 'estimate' };
}
