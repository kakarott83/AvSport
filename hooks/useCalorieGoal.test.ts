/**
 * Unit tests for the pure calorie-goal logic in useCalorieGoal.
 *
 * Strategy:
 *  - Test the exported `computeCalorieGoal` function directly — no React
 *    rendering, no network calls.
 *  - Supabase is mocked at the module level so any accidental import of the
 *    client never causes real requests (guards against future refactors too).
 *  - The system clock is pinned to 2026-04-12 so age-based TDEE values are
 *    stable regardless of when the suite is run.
 */

// ── Supabase mock (isolates tests from real network/auth) ──────────────────────

jest.mock('@/services/supabaseClient', () => {
  const chainable = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    gte:    jest.fn().mockReturnThis(),
    lte:    jest.fn().mockReturnThis(),
    lt:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
      },
      from: jest.fn(() => ({ ...chainable })),
    },
  };
});

// ── expo-router mock (useFocusEffect is a no-op in the test env) ───────────────

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));

// ── Subject under test ────────────────────────────────────────────────────────

import { computeCalorieGoal, type DailyLogRow, type ProfileData } from './useCalorieGoal';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an ISO date string relative to the pinned "today" (2026-04-12). */
function daysAgo(n: number): string {
  return new Date(Date.UTC(2026, 3, 12) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Minimal profile with all fields required for Harris-Benedict. */
const BASE_PROFILE: ProfileData = {
  gender:                 'female',
  date_of_birth:          '1995-03-01', // age 31 on 2026-04-12
  height_cm:              170,
  weight_kg:              65,
  manual_calorie_offset:  0,
  auto_adjust_calories:   false,
  cycle_tracking_enabled: true,
  cycle_length_days:      28,
  cycle_calorie_bonus:    250,
};

// ── Fixed clock ───────────────────────────────────────────────────────────────

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-04-12T12:00:00Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeCalorieGoal', () => {
  // ── 1. Basis-TDEE ────────────────────────────────────────────────────────────

  describe('Basis-Ziel (kein Bonus, kein Training-Burn)', () => {
    it('gibt das korrekte Harris-Benedict TDEE zurück', () => {
      // Female, 31 y, 170 cm, 65 kg — no period logs → no luteal phase
      // BMR  = 447.593 + 9.247×65 + 3.098×170 − 4.33×31
      //      = 447.593 + 601.055 + 526.66 − 134.23 = 1 441.078
      // TDEE = round(1 441.078 × 1.55) = round(2 233.67) = 2 234
      const result = computeCalorieGoal(BASE_PROFILE, [], 0);

      expect(result.currentGoal).toBe(2234);
      expect(result.bonusActive).toBe(false);
      expect(result.cycleBonus).toBe(0);
      expect(result.isLuteal).toBe(false);
    });

    it('addiert manual_calorie_offset auf das Basis-TDEE', () => {
      const profile: ProfileData = { ...BASE_PROFILE, manual_calorie_offset: 200 };
      const result = computeCalorieGoal(profile, [], 0);

      expect(result.currentGoal).toBe(2234 + 200);
      expect(result.bonusActive).toBe(false);
    });

    it('fällt auf 2 500 kcal zurück wenn Körperdaten fehlen', () => {
      const incomplete: ProfileData = {
        ...BASE_PROFILE,
        weight_kg: null,   // triggers the fallback path
        manual_calorie_offset: 0,
      };
      const result = computeCalorieGoal(incomplete, [], 0);

      expect(result.currentGoal).toBe(2500);
    });

    it('addiert verbrannte Kalorien wenn auto_adjust_calories aktiv ist', () => {
      const profile: ProfileData = { ...BASE_PROFILE, auto_adjust_calories: true };
      const result = computeCalorieGoal(profile, [], 350);

      expect(result.currentGoal).toBe(2234 + 350);
    });

    it('ignoriert verbrannte Kalorien wenn auto_adjust_calories deaktiviert ist', () => {
      // auto_adjust_calories is false in BASE_PROFILE
      const result = computeCalorieGoal(BASE_PROFILE, [], 350);

      expect(result.currentGoal).toBe(2234);
    });
  });

  // ── 2. Lutealphase-Bonus wird addiert ────────────────────────────────────────

  describe('cycle_calorie_bonus wird addiert wenn isLuteal = true', () => {
    /**
     * Pinned date: 2026-04-12
     * Cycle length: 28 days
     * Last period:  18 days ago (2026-03-25)
     *   → next period: 2026-04-22
     *   → luteal start: 2026-04-08
     *   → 2026-04-12 is in [2026-04-08, 2026-04-22)  ✓
     */
    const PERIOD_LOG: DailyLogRow = { date: daysAgo(18), tags: ['period'] };

    it('setzt isLuteal = true wenn das letzte Perioden-Datum im Luteafenster liegt', () => {
      const result = computeCalorieGoal(BASE_PROFILE, [PERIOD_LOG], 0);

      expect(result.isLuteal).toBe(true);
    });

    it('addiert cycle_calorie_bonus (250 kcal) auf das TDEE', () => {
      const result = computeCalorieGoal(BASE_PROFILE, [PERIOD_LOG], 0);

      expect(result.bonusActive).toBe(true);
      expect(result.cycleBonus).toBe(250);
      expect(result.currentGoal).toBe(2234 + 250);
    });

    it('kombiniert Training-Burn und Lutealbonus korrekt', () => {
      const profile: ProfileData = { ...BASE_PROFILE, auto_adjust_calories: true };
      const result = computeCalorieGoal(profile, [PERIOD_LOG], 400);

      expect(result.currentGoal).toBe(2234 + 400 + 250);
    });
  });

  // ── 3. Bonus NICHT addiert wenn cycle_tracking_enabled = false ───────────────

  describe('cycle_calorie_bonus wird NICHT addiert wenn Zyklustracking deaktiviert ist', () => {
    const PERIOD_LOG: DailyLogRow = { date: daysAgo(18), tags: ['period'] };

    it('setzt bonusActive = false obwohl Logs vorhanden und im Luteafenster', () => {
      const profile: ProfileData = { ...BASE_PROFILE, cycle_tracking_enabled: false };
      const result = computeCalorieGoal(profile, [PERIOD_LOG], 0);

      expect(result.bonusActive).toBe(false);
      expect(result.isLuteal).toBe(false);
      expect(result.cycleBonus).toBe(0);
    });

    it('currentGoal entspricht dem reinen TDEE ohne Bonus', () => {
      const profile: ProfileData = { ...BASE_PROFILE, cycle_tracking_enabled: false };
      const result = computeCalorieGoal(profile, [PERIOD_LOG], 0);

      expect(result.currentGoal).toBe(2234);
    });

    it('addiert keinen Bonus wenn cycle_calorie_bonus = 0', () => {
      const profile: ProfileData = { ...BASE_PROFILE, cycle_calorie_bonus: 0 };
      const result = computeCalorieGoal(profile, [PERIOD_LOG], 0);

      // isLuteal is still true, but bonus is 0 → bonusActive must be false
      expect(result.bonusActive).toBe(false);
      expect(result.cycleBonus).toBe(0);
      expect(result.currentGoal).toBe(2234);
    });

    it('addiert keinen Bonus wenn kein Perioden-Log vorhanden ist', () => {
      // No logs at all → isInLutealPhase returns false
      const result = computeCalorieGoal(BASE_PROFILE, [], 0);

      expect(result.isLuteal).toBe(false);
      expect(result.bonusActive).toBe(false);
      expect(result.currentGoal).toBe(2234);
    });

    it('addiert keinen Bonus wenn letzter Eintrag außerhalb des Luteafensters liegt', () => {
      // Period 2 days ago → next period in 26 days → luteal starts in 12 days → NOT in window
      const recentLog: DailyLogRow = { date: daysAgo(2), tags: ['period'] };
      const result = computeCalorieGoal(BASE_PROFILE, [recentLog], 0);

      expect(result.isLuteal).toBe(false);
      expect(result.bonusActive).toBe(false);
    });
  });
});
