/// <reference types="jest" />

import { ACTIVITY_WATER_BONUS_ML, calculateWaterGoal, DEFAULT_WATER_GOAL_ML, MIN_WATER_GOAL_ML } from '@/lib/waterGoal';

describe('calculateWaterGoal', () => {
  it('nutzt den manuellen Wert, wenn gesetzt', () => {
    expect(calculateWaterGoal(70, 3000)).toEqual({ goalMl: 3000, source: 'user' });
  });

  it('ignoriert einen manuellen Wert von 0 oder negativ', () => {
    expect(calculateWaterGoal(70, 0)).toEqual({ goalMl: 2450, source: 'estimate' });
    expect(calculateWaterGoal(70, -100)).toEqual({ goalMl: 2450, source: 'estimate' });
  });

  it('schätzt aus dem Körpergewicht, wenn kein manueller Wert gesetzt ist', () => {
    expect(calculateWaterGoal(70, null)).toEqual({ goalMl: 2450, source: 'estimate' });
  });

  it('rundet die Schätzung', () => {
    expect(calculateWaterGoal(63.3, null).goalMl).toBe(Math.round(63.3 * 35));
  });

  it('greift auf den Mindestwert zurück, wenn die Schätzung darunter liegt', () => {
    const result = calculateWaterGoal(20, null); // 20*35 = 700 < 1200
    expect(result.goalMl).toBe(MIN_WATER_GOAL_ML);
    expect(result.source).toBe('estimate');
  });

  it('nutzt den Default, wenn weder Gewicht noch manueller Wert bekannt sind', () => {
    expect(calculateWaterGoal(null, null)).toEqual({ goalMl: DEFAULT_WATER_GOAL_ML, source: 'estimate' });
    expect(calculateWaterGoal(undefined, undefined)).toEqual({ goalMl: DEFAULT_WATER_GOAL_ML, source: 'estimate' });
  });

  it('addiert den Aktivitäts-Bonus zur Gewichtsschätzung', () => {
    expect(calculateWaterGoal(70, null, 'very_active').goalMl).toBe(70 * 35 + ACTIVITY_WATER_BONUS_ML.very_active);
    expect(calculateWaterGoal(70, null, 'active').goalMl).toBe(70 * 35 + ACTIVITY_WATER_BONUS_ML.active);
  });

  it('ignoriert einen unbekannten Aktivitätswert (Bonus 0)', () => {
    expect(calculateWaterGoal(70, null, 'unbekannt').goalMl).toBe(2450);
  });

  it('lässt den manuellen Wert vom Aktivitäts-Bonus unberührt', () => {
    expect(calculateWaterGoal(70, 3000, 'very_active')).toEqual({ goalMl: 3000, source: 'user' });
  });
});
