/**
 * Pure calorie-burn estimation for logged workouts.
 * No React, no network — safe to import from tests, hooks and screens alike.
 *
 * Uses the standard MET formula from the Compendium of Physical Activities:
 *
 *   kcal/min = MET · 3.5 · Körpergewicht(kg) / 200
 *
 * Der MET-Wert richtet sich nach der Trainingsart. Zirkeltraining mit kurzen
 * Pausen hat einen deutlich höheren Dauerumsatz als klassisches Krafttraining
 * mit langen Satzpausen.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export type WorkoutKind = 'strength' | 'circuit';

/** MET-Werte je Trainingsart (Compendium 2011, moderat–intensiv gemittelt). */
export const WORKOUT_MET: Record<WorkoutKind, number> = {
  strength: 5.0, // Krafttraining, mehrere Übungen, mit Satzpausen
  circuit: 7.0,  // Zirkeltraining, geringe Pausen, teils Cardio-Anteil
};

/** Fallback-Körpergewicht, wenn im Profil kein Gewicht hinterlegt ist. */
export const DEFAULT_WEIGHT_KG = 70;

// ─────────────────────────────────────────────────────────────────────────────
// Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schätzt den Kalorienverbrauch für ein Trainings-Segment.
 *
 * @param seconds          Dauer des Segments in Sekunden (inkl. Pausen).
 * @param weightKg         Körpergewicht des Users; null/0 → DEFAULT_WEIGHT_KG.
 * @param kind             'strength' (Standard) oder 'circuit'.
 * @param intensityFactor  Optionaler Multiplikator aus dem Profil
 *                         (`workout_intensity_factor`, Default 1.0).
 * @returns Ganzzahliger kcal-Wert (nie negativ).
 */
export function estimateWorkoutKcal(
  seconds: number,
  weightKg: number | null | undefined,
  kind: WorkoutKind = 'strength',
  intensityFactor: number | null | undefined = 1,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;

  const kg = weightKg != null && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  const met = WORKOUT_MET[kind] ?? WORKOUT_MET.strength;
  const factor = intensityFactor != null && intensityFactor > 0 ? intensityFactor : 1;

  const kcalPerMin = (met * 3.5 * kg) / 200;
  const kcal = kcalPerMin * (seconds / 60) * factor;

  return Math.max(0, Math.round(kcal));
}
