/**
 * Tests for lib/nutrition.ts
 *
 * Covers:
 *  - computeDayTotals: normal meals, null macros, 0-kcal entries, empty list
 *  - computeRemaining: positive / negative remaining
 *  - buildWeekDays: length, "Heute" label, dayMap values, missing days
 */

jest.mock('@/services/supabaseClient');
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

import {
  buildWeekDays,
  computeDayTotals,
  computeRemaining,
  type FoodLog,
} from '@/lib/nutrition';

import {
  caloriesOnlyMealFixture,
  fullMealFixture,
  zeroCalMealFixture,
} from '@/__mocks__/supabase-fixtures';

// ── Clock ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-04-12T12:00:00Z'));
});

afterAll(() => jest.useRealTimers());

// ── computeDayTotals ─────────────────────────────────────────────────────────

describe('computeDayTotals', () => {
  it('gibt Nullwerte zurück wenn keine Mahlzeiten vorhanden sind', () => {
    const result = computeDayTotals([]);

    expect(result.totalKcal).toBe(0);
    expect(result.totalProtein).toBe(0);
    expect(result.totalCarbs).toBe(0);
    expect(result.totalFat).toBe(0);
  });

  it('summiert eine einzelne vollständige Mahlzeit korrekt', () => {
    const result = computeDayTotals([fullMealFixture]);

    expect(result.totalKcal).toBe(350);
    expect(result.totalProtein).toBe(12);
    expect(result.totalCarbs).toBe(55);
    expect(result.totalFat).toBe(6);
  });

  it('behandelt null-Makros als 0', () => {
    const result = computeDayTotals([caloriesOnlyMealFixture]);

    expect(result.totalKcal).toBe(90);
    expect(result.totalProtein).toBe(0);
    expect(result.totalCarbs).toBe(0);
    expect(result.totalFat).toBe(0);
  });

  it('behandelt eine Mahlzeit mit 0 kcal korrekt (z.B. schwarzer Kaffee)', () => {
    const result = computeDayTotals([zeroCalMealFixture]);

    expect(result.totalKcal).toBe(0);
    expect(result.totalProtein).toBe(0);
    expect(result.totalCarbs).toBe(0);
    expect(result.totalFat).toBe(0);
  });

  it('summiert mehrere Mahlzeiten mit gemischten null-Feldern', () => {
    const result = computeDayTotals([fullMealFixture, caloriesOnlyMealFixture]);

    expect(result.totalKcal).toBe(350 + 90);         // 440
    expect(result.totalProtein).toBe(12 + 0);         // 12
    expect(result.totalCarbs).toBe(55 + 0);           // 55
    expect(result.totalFat).toBe(6 + 0);              // 6
  });

  it('rundet Makro-Gramm auf ganze Zahlen', () => {
    const meal: FoodLog = {
      id: 'x', meal_name: 'Test', calories: 100,
      protein: 10.4, carbs: 20.5, fat: 5.6,
      created_at: '2026-04-12T09:00:00Z',
    };
    const result = computeDayTotals([meal]);

    expect(result.totalProtein).toBe(10);    // Math.round(10.4)
    expect(result.totalCarbs).toBe(21);      // Math.round(20.5)  → rounds up
    expect(result.totalFat).toBe(6);         // Math.round(5.6)   → rounds up
  });

  it('rundet Makros bei Summen über mehrere Mahlzeiten korrekt', () => {
    // Two meals each contributing 0.3 g protein → total 0.6 → rounds to 1
    const m1: FoodLog = { id: 'a', meal_name: 'A', calories: 10, protein: 0.3, carbs: null, fat: null, created_at: '' };
    const m2: FoodLog = { id: 'b', meal_name: 'B', calories: 10, protein: 0.3, carbs: null, fat: null, created_at: '' };
    const result = computeDayTotals([m1, m2]);

    expect(result.totalProtein).toBe(1);     // Math.round(0.6)
  });

  it('verarbeitet große Kalorienwerte ohne Overflow', () => {
    const big: FoodLog = {
      id: 'big', meal_name: 'Big', calories: 5000,
      protein: 200, carbs: 400, fat: 150,
      created_at: '',
    };
    const result = computeDayTotals([big]);

    expect(result.totalKcal).toBe(5000);
    expect(result.totalProtein).toBe(200);
  });
});

// ── computeRemaining ──────────────────────────────────────────────────────────

describe('computeRemaining', () => {
  it('gibt positive verbleibende Kalorien zurück', () => {
    expect(computeRemaining(2000, 800)).toBe(1200);
  });

  it('gibt negative Kalorien zurück wenn das Ziel überschritten wurde', () => {
    expect(computeRemaining(2000, 2300)).toBe(-300);
  });

  it('gibt 0 zurück wenn genau das Ziel getroffen wurde', () => {
    expect(computeRemaining(2000, 2000)).toBe(0);
  });

  it('gibt das volle Ziel zurück wenn noch nichts gegessen wurde', () => {
    expect(computeRemaining(2000, 0)).toBe(2000);
  });
});

// ── buildWeekDays ─────────────────────────────────────────────────────────────

describe('buildWeekDays', () => {
  it('gibt immer genau 7 Einträge zurück', () => {
    expect(buildWeekDays({})).toHaveLength(7);
  });

  it('beschriftet den letzten Eintrag als "Heute"', () => {
    const days = buildWeekDays({});
    expect(days[6].label).toBe('Heute');
  });

  it('setzt eaten = 0 für Tage ohne Eintrag in der dayMap', () => {
    const days = buildWeekDays({});
    expect(days.every(d => d.eaten === 0)).toBe(true);
  });

  it('übernimmt Kalorien-Werte aus der dayMap korrekt', () => {
    // "today" is 2026-04-12 (pinned clock)
    const dayMap: Record<string, number> = { '2026-04-12': 1800, '2026-04-11': 1500 };
    const days = buildWeekDays(dayMap);

    const today      = days.find(d => d.date === '2026-04-12');
    const yesterday  = days.find(d => d.date === '2026-04-11');

    expect(today?.eaten).toBe(1800);
    expect(yesterday?.eaten).toBe(1500);
  });

  it('die Datumsreihenfolge ist chronologisch aufsteigend', () => {
    const days = buildWeekDays({});
    for (let i = 1; i < days.length; i++) {
      expect(days[i].date > days[i - 1].date).toBe(true);
    }
  });

  it('verwendet deutsche Wochentag-Labels für vergangene Tage', () => {
    const days = buildWeekDays({});
    const DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    // Every non-today entry should be a valid DE weekday label
    days.slice(0, 6).forEach(d => {
      expect(DE).toContain(d.label);
    });
  });
});
