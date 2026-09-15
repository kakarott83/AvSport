/// <reference types="jest" />

import {
  DEFAULT_WEIGHT_KG,
  estimateWorkoutKcal,
  WORKOUT_MET,
} from '@/lib/calorieBurn';

describe('estimateWorkoutKcal', () => {
  it('berechnet Krafttraining nach der MET-Formel', () => {
    // 30 min, 80 kg, MET 5.0 → 5*3.5*80/200 = 7 kcal/min → 210 kcal
    expect(estimateWorkoutKcal(30 * 60, 80, 'strength')).toBe(210);
  });

  it('rechnet Zirkeltraining mit höherem MET', () => {
    // 30 min, 80 kg, MET 7.0 → 9.8 kcal/min → 294 kcal
    expect(estimateWorkoutKcal(30 * 60, 80, 'circuit')).toBe(294);
    expect(WORKOUT_MET.circuit).toBeGreaterThan(WORKOUT_MET.strength);
  });

  it('nutzt das Standardgewicht, wenn kein Gewicht bekannt ist', () => {
    const withFallback = estimateWorkoutKcal(20 * 60, null);
    const explicit = estimateWorkoutKcal(20 * 60, DEFAULT_WEIGHT_KG);
    expect(withFallback).toBe(explicit);
    expect(withFallback).toBeGreaterThan(0);
  });

  it('behandelt 0/negative Gewichte wie unbekannt', () => {
    expect(estimateWorkoutKcal(600, 0)).toBe(estimateWorkoutKcal(600, DEFAULT_WEIGHT_KG));
    expect(estimateWorkoutKcal(600, -5)).toBe(estimateWorkoutKcal(600, DEFAULT_WEIGHT_KG));
  });

  it('wendet den Intensitätsfaktor an', () => {
    const base = estimateWorkoutKcal(15 * 60, 75, 'strength', 1);
    expect(estimateWorkoutKcal(15 * 60, 75, 'strength', 1.2)).toBe(Math.round(base * 1.2));
  });

  it('ignoriert einen ungültigen Intensitätsfaktor', () => {
    const base = estimateWorkoutKcal(15 * 60, 75, 'strength', 1);
    expect(estimateWorkoutKcal(15 * 60, 75, 'strength', 0)).toBe(base);
    expect(estimateWorkoutKcal(15 * 60, 75, 'strength', null)).toBe(base);
  });

  it('liefert 0 für nicht-positive oder ungültige Dauer', () => {
    expect(estimateWorkoutKcal(0, 80)).toBe(0);
    expect(estimateWorkoutKcal(-100, 80)).toBe(0);
    expect(estimateWorkoutKcal(NaN, 80)).toBe(0);
  });

  it('skaliert linear mit der Dauer', () => {
    const ten = estimateWorkoutKcal(10 * 60, 80, 'strength');
    const twenty = estimateWorkoutKcal(20 * 60, 80, 'strength');
    expect(twenty).toBe(ten * 2);
  });
});
