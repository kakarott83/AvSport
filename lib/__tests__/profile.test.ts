/**
 * Tests for lib/profile.ts
 *
 * Covers:
 *  - STEPPER_BOUNDS: authoritative min/max/step values
 *  - clampStepper: boundary clamping, exact limits, increments / decrements
 *  - validateProfileForm: required display_name, whitespace rejection
 *  - parseProfileFloat / parseProfileInt: NaN fallback, valid strings, edge cases
 */

jest.mock('@/services/supabaseClient');
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

import {
  clampStepper,
  parseProfileFloat,
  parseProfileInt,
  STEPPER_BOUNDS,
  validateProfileForm,
} from '@/lib/profile';

// ── STEPPER_BOUNDS ────────────────────────────────────────────────────────────

describe('STEPPER_BOUNDS', () => {
  it('cycle_length_days hat die korrekten Grenzen [18, 45]', () => {
    expect(STEPPER_BOUNDS.cycle_length_days.min).toBe(18);
    expect(STEPPER_BOUNDS.cycle_length_days.max).toBe(45);
    expect(STEPPER_BOUNDS.cycle_length_days.step).toBe(1);
  });

  it('period_duration_days hat die korrekten Grenzen [1, 10]', () => {
    expect(STEPPER_BOUNDS.period_duration_days.min).toBe(1);
    expect(STEPPER_BOUNDS.period_duration_days.max).toBe(10);
    expect(STEPPER_BOUNDS.period_duration_days.step).toBe(1);
  });

  it('cycle_calorie_bonus hat die korrekten Grenzen [0, 500] mit Schritt 25', () => {
    expect(STEPPER_BOUNDS.cycle_calorie_bonus.min).toBe(0);
    expect(STEPPER_BOUNDS.cycle_calorie_bonus.max).toBe(500);
    expect(STEPPER_BOUNDS.cycle_calorie_bonus.step).toBe(25);
  });

  it('water_goal_ml hat die korrekten Grenzen [0, 6000] mit Schritt 100', () => {
    expect(STEPPER_BOUNDS.water_goal_ml).toEqual({ min: 0, max: 6_000, step: 100 });
  });

  it('die Wasser-Erinnerungs-Stunden liegen im gültigen Tagesbereich', () => {
    expect(STEPPER_BOUNDS.water_reminder_start_hour.min).toBeGreaterThanOrEqual(0);
    expect(STEPPER_BOUNDS.water_reminder_end_hour.max).toBeLessThanOrEqual(23);
    expect(STEPPER_BOUNDS.water_reminder_interval_hours).toEqual({ min: 1, max: 6, step: 1 });
  });
});

// ── clampStepper ──────────────────────────────────────────────────────────────

describe('clampStepper', () => {
  const { min: CYCLE_MIN, max: CYCLE_MAX } = STEPPER_BOUNDS.cycle_length_days;

  it('gibt das korrekte Ergebnis für einen normalen Schritt zurück', () => {
    expect(clampStepper(28, +1, CYCLE_MIN, CYCLE_MAX)).toBe(29);
    expect(clampStepper(28, -1, CYCLE_MIN, CYCLE_MAX)).toBe(27);
  });

  it('klemmt bei der Untergrenze', () => {
    expect(clampStepper(CYCLE_MIN, -1, CYCLE_MIN, CYCLE_MAX)).toBe(CYCLE_MIN);
    expect(clampStepper(CYCLE_MIN - 5, -1, CYCLE_MIN, CYCLE_MAX)).toBe(CYCLE_MIN);
  });

  it('klemmt bei der Obergrenze', () => {
    expect(clampStepper(CYCLE_MAX, +1, CYCLE_MIN, CYCLE_MAX)).toBe(CYCLE_MAX);
    expect(clampStepper(CYCLE_MAX + 5, +1, CYCLE_MIN, CYCLE_MAX)).toBe(CYCLE_MAX);
  });

  it('bleibt genau an der Untergrenze wenn bereits am Minimum', () => {
    expect(clampStepper(CYCLE_MIN, 0, CYCLE_MIN, CYCLE_MAX)).toBe(CYCLE_MIN);
  });

  it('bleibt genau an der Obergrenze wenn bereits am Maximum', () => {
    expect(clampStepper(CYCLE_MAX, 0, CYCLE_MIN, CYCLE_MAX)).toBe(CYCLE_MAX);
  });

  it('verarbeitet den cycle_calorie_bonus-Schritt von 25 korrekt', () => {
    const { min, max } = STEPPER_BOUNDS.cycle_calorie_bonus;
    expect(clampStepper(100, +25, min, max)).toBe(125);
    expect(clampStepper(100, -25, min, max)).toBe(75);
  });

  it('klemmt cycle_calorie_bonus nicht unter 0', () => {
    const { min, max } = STEPPER_BOUNDS.cycle_calorie_bonus;
    expect(clampStepper(0, -25, min, max)).toBe(0);
  });

  it('klemmt cycle_calorie_bonus nicht über 500', () => {
    const { min, max } = STEPPER_BOUNDS.cycle_calorie_bonus;
    expect(clampStepper(500, +25, min, max)).toBe(500);
  });

  it('verarbeitet period_duration_days an beiden Grenzen', () => {
    const { min, max } = STEPPER_BOUNDS.period_duration_days;
    expect(clampStepper(min, -1, min, max)).toBe(min);
    expect(clampStepper(max, +1, min, max)).toBe(max);
  });
});

// ── validateProfileForm ───────────────────────────────────────────────────────

describe('validateProfileForm', () => {
  it('ist ungültig wenn display_name leer ist', () => {
    const result = validateProfileForm({ display_name: '' });
    expect(result.valid).toBe(false);
    expect(result.error).not.toBe('');
  });

  it('ist ungültig wenn display_name nur Leerzeichen enthält', () => {
    const result = validateProfileForm({ display_name: '   ' });
    expect(result.valid).toBe(false);
  });

  it('ist gültig wenn display_name einen echten Namen enthält', () => {
    const result = validateProfileForm({ display_name: 'Anna' });
    expect(result.valid).toBe(true);
    expect(result.error).toBe('');
  });

  it('ist gültig wenn display_name führende und abschließende Leerzeichen hat', () => {
    // " Anna " is valid — the screen will .trim() before saving
    const result = validateProfileForm({ display_name: ' Anna ' });
    expect(result.valid).toBe(true);
  });

  it('liefert den deutschen Fehlermeldungstext', () => {
    const result = validateProfileForm({ display_name: '' });
    expect(result.error).toBe('Bitte einen Anzeigenamen eingeben.');
  });
});

// ── parseProfileFloat ─────────────────────────────────────────────────────────

describe('parseProfileFloat', () => {
  it('parst einen gültigen Dezimalstring', () => {
    expect(parseProfileFloat('2.5', 2.0)).toBe(2.5);
  });

  it('parst einen ganzzahligen String', () => {
    expect(parseProfileFloat('3', 2.0)).toBe(3);
  });

  it('gibt den Fallback-Wert für einen leeren String zurück', () => {
    expect(parseProfileFloat('', 2.0)).toBe(2.0);
  });

  it('gibt den Fallback-Wert für einen nicht-numerischen String zurück', () => {
    expect(parseProfileFloat('abc', 2.0)).toBe(2.0);
  });

  it('gibt den Fallback-Wert für "NaN" zurück', () => {
    expect(parseProfileFloat('NaN', 2.0)).toBe(2.0);
  });

  it('parst einen negativen Wert korrekt', () => {
    expect(parseProfileFloat('-500', 0)).toBe(-500);
  });
});

// ── parseProfileInt ───────────────────────────────────────────────────────────

describe('parseProfileInt', () => {
  it('parst einen ganzzahligen String', () => {
    expect(parseProfileInt('10', 0)).toBe(10);
  });

  it('schneidet Dezimalstellen ab (parseInt, kein Runden)', () => {
    expect(parseProfileInt('10.9', 0)).toBe(10);
  });

  it('gibt den Fallback-Wert für einen leeren String zurück', () => {
    expect(parseProfileInt('', 0)).toBe(0);
  });

  it('gibt den Fallback-Wert für einen nicht-numerischen String zurück', () => {
    expect(parseProfileInt('abc', 0)).toBe(0);
  });

  it('parst einen negativen Offset-Wert korrekt', () => {
    expect(parseProfileInt('-300', 0)).toBe(-300);
  });

  it('parst einen positiven Offset-Wert korrekt', () => {
    expect(parseProfileInt('+200', 0)).toBe(200);
  });
});
