/**
 * Unit tests for lib/stepGoal.ts
 *
 * Covered:
 * 1. calculateDailyStepGoal – correct goal per activity level
 * 2. calculateDailyStepGoal – manual override wins over activity level
 * 3. calculateDailyStepGoal – manual = 0 falls back to activity-based goal
 * 4. calculateKcalPerStep   – weight-based formula
 * 5. stepsToWeightedKcal    – step count × kcal/step, rounded
 * 6. Dashboard coupling     – goal changes when activity level changes (key scenario)
 */

import {
  ACTIVITY_BONUS,
  BASE_STEPS,
  ActivityLevel,
  calculateDailyStepGoal,
  calculateKcalPerStep,
  stepsToWeightedKcal,
} from "../stepGoal";

// ─────────────────────────────────────────────────────────────────────────────
// calculateDailyStepGoal – activity levels
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateDailyStepGoal – activity levels", () => {
  it("sedentary → 5 000 (base only)", () => {
    expect(calculateDailyStepGoal("sedentary")).toBe(5_000);
  });

  it("light → 7 000 (base + 2 000)", () => {
    expect(calculateDailyStepGoal("light")).toBe(7_000);
  });

  it("active → 10 000 (base + 5 000)", () => {
    expect(calculateDailyStepGoal("active")).toBe(10_000);
  });

  it("very_active → 15 000 (base + 10 000)", () => {
    expect(calculateDailyStepGoal("very_active")).toBe(15_000);
  });

  it("every level satisfies BASE_STEPS + ACTIVITY_BONUS[level]", () => {
    const levels: ActivityLevel[] = ["sedentary", "light", "active", "very_active"];
    for (const level of levels) {
      expect(calculateDailyStepGoal(level)).toBe(BASE_STEPS + ACTIVITY_BONUS[level]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateDailyStepGoal – manual override
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateDailyStepGoal – manual override", () => {
  it("manual > 0 returns the manual value regardless of activity level", () => {
    expect(calculateDailyStepGoal("sedentary",  8_000)).toBe(8_000);
    expect(calculateDailyStepGoal("light",      8_000)).toBe(8_000);
    expect(calculateDailyStepGoal("active",     8_000)).toBe(8_000);
    expect(calculateDailyStepGoal("very_active", 8_000)).toBe(8_000);
  });

  it("manual = 0 falls back to activity-based calculation", () => {
    expect(calculateDailyStepGoal("active", 0)).toBe(10_000);
  });

  it("manual = null falls back to activity-based calculation", () => {
    expect(calculateDailyStepGoal("active", null)).toBe(10_000);
  });

  it("manual = undefined falls back to activity-based calculation", () => {
    expect(calculateDailyStepGoal("active", undefined)).toBe(10_000);
  });

  it("manual = negative is treated as falsy → falls back", () => {
    // negative values are not a valid input but the function should be robust
    expect(calculateDailyStepGoal("sedentary", -500)).toBe(5_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard coupling — goal updates when activity level changes
//
// This is the key integration scenario requested:
//   "Prüfe ob bei einer Änderung des Aktivitätslevels das Schrittziel
//    korrekt neu berechnet wird."
// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard coupling – goal responds to activity level change", () => {
  it("switching from sedentary to active doubles the additive bonus", () => {
    const before = calculateDailyStepGoal("sedentary");
    const after  = calculateDailyStepGoal("active");

    expect(after).toBeGreaterThan(before);
    expect(after - before).toBe(ACTIVITY_BONUS["active"] - ACTIVITY_BONUS["sedentary"]);
  });

  it("each successive level increases the goal monotonically", () => {
    const goals = [
      calculateDailyStepGoal("sedentary"),
      calculateDailyStepGoal("light"),
      calculateDailyStepGoal("active"),
      calculateDailyStepGoal("very_active"),
    ];
    for (let i = 1; i < goals.length; i++) {
      expect(goals[i]).toBeGreaterThan(goals[i - 1]);
    }
  });

  it("simulates a user changing level from 'light' to 'very_active' in the profile", () => {
    // Before change: profile stores 'light'
    let currentLevel: ActivityLevel = "light";
    expect(calculateDailyStepGoal(currentLevel)).toBe(7_000);

    // User taps 'Sehr aktiv' in the profile UI → level updates
    currentLevel = "very_active";
    expect(calculateDailyStepGoal(currentLevel)).toBe(15_000);

    // Dashboard progress bar denominator changes: 5 000 steps now covers
    // 5000/15000 = 33 % instead of 5000/7000 = 71 %
    const steps = 5_000;
    const progressBefore = steps / 7_000;
    const progressAfter  = steps / 15_000;
    expect(progressAfter).toBeLessThan(progressBefore);
    expect(progressAfter).toBeCloseTo(0.333, 2);
  });

  it("manual override short-circuits the level – goal stays fixed when level changes", () => {
    const manual = 12_000;

    // Even as the level changes, the goal remains the manual value
    expect(calculateDailyStepGoal("sedentary",  manual)).toBe(12_000);
    expect(calculateDailyStepGoal("very_active", manual)).toBe(12_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateKcalPerStep
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateKcalPerStep", () => {
  it("returns 0 for null weight", () => {
    expect(calculateKcalPerStep(null)).toBe(0);
  });

  it("returns 0 for undefined weight", () => {
    expect(calculateKcalPerStep(undefined)).toBe(0);
  });

  it("returns 0 for weight = 0", () => {
    expect(calculateKcalPerStep(0)).toBe(0);
  });

  it("applies weight × 0.0005 formula", () => {
    expect(calculateKcalPerStep(80)).toBeCloseTo(0.04);
    expect(calculateKcalPerStep(60)).toBeCloseTo(0.03);
    expect(calculateKcalPerStep(100)).toBeCloseTo(0.05);
  });

  it("heavier user burns more kcal per step", () => {
    expect(calculateKcalPerStep(100)).toBeGreaterThan(calculateKcalPerStep(60));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stepsToWeightedKcal
// ─────────────────────────────────────────────────────────────────────────────

describe("stepsToWeightedKcal", () => {
  it("returns 0 for 0 steps", () => {
    expect(stepsToWeightedKcal(0, 80)).toBe(0);
  });

  it("returns 0 when weight is null", () => {
    expect(stepsToWeightedKcal(10_000, null)).toBe(0);
  });

  it("80 kg × 10 000 steps = 400 kcal", () => {
    // 80 × 0.0005 × 10 000 = 400
    expect(stepsToWeightedKcal(10_000, 80)).toBe(400);
  });

  it("60 kg × 7 000 steps = 210 kcal", () => {
    // 60 × 0.0005 × 7 000 = 210
    expect(stepsToWeightedKcal(7_000, 60)).toBe(210);
  });

  it("rounds fractional results to nearest integer", () => {
    // 75 × 0.0005 × 1 = 0.0375 → 0
    // 75 × 0.0005 × 100 = 3.75 → 4
    expect(stepsToWeightedKcal(100, 75)).toBe(4);
  });
});
