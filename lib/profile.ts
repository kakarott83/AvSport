/**
 * Pure profile-validation and stepper helpers.
 * No React, no React Native — safe to import from tests.
 */

// ── Stepper field bounds ───────────────────────────────────────────────────────

export type StepperField =
  | 'cycle_length_days'
  | 'period_duration_days'
  | 'cycle_calorie_bonus'
  | 'manual_step_goal';

export type StepperBounds = { min: number; max: number; step: number };

/**
 * Authoritative bounds for every numeric stepper in the profile form.
 * Tests pin against these constants so a UI change automatically breaks tests.
 */
export const STEPPER_BOUNDS: Record<StepperField, StepperBounds> = {
  cycle_length_days:    { min: 18,    max: 45,     step: 1    },
  period_duration_days: { min: 1,     max: 10,     step: 1    },
  cycle_calorie_bonus:  { min: 0,     max: 500,    step: 25   },
  /**
   * 0 = automatic (derived from activity level).
   * > 0 = user's manual override; stored in profiles.manual_step_goal.
   */
  manual_step_goal:     { min: 0,     max: 30_000, step: 500  },
};

/**
 * Apply a delta to a stepper value and clamp to [min, max].
 * Pure — does not mutate any state.
 */
export function clampStepper(
  current: number,
  delta: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, current + delta));
}

// ── Form validation ────────────────────────────────────────────────────────────

export type ProfileValidationResult = {
  valid: boolean;
  /** German user-facing error message, empty string when valid. */
  error: string;
};

/**
 * Validate the fields the "Speichern" handler checks before hitting Supabase.
 * Mirrors the checks in `handleSave` in profile.tsx.
 */
export function validateProfileForm(form: {
  display_name: string;
}): ProfileValidationResult {
  if (!form.display_name.trim()) {
    return { valid: false, error: 'Bitte einen Anzeigenamen eingeben.' };
  }
  return { valid: true, error: '' };
}

// ── Input parsing ──────────────────────────────────────────────────────────────

/** Parse a user-typed decimal string; return `fallback` on NaN or empty input. */
export function parseProfileFloat(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  return isNaN(n) ? fallback : n;
}

/** Parse a user-typed integer string; return `fallback` on NaN or empty input. */
export function parseProfileInt(raw: string, fallback: number): number {
  const n = parseInt(raw, 10);
  return isNaN(n) ? fallback : n;
}
