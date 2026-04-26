/**
 * Unit tests for lib/healthManager.ts
 *
 * Covered:
 * 1. stepsToKcal – formula correctness (steps × 0.04, rounded)
 * 2. STEPS_GOAL  – canonical daily target = 10 000
 * 3. getTodayActivity – never throws; returns { kcal, steps } shape
 * 4. requestHealthPermissions – never throws; returns boolean
 */

// The health-connect native module is stubbed by
// __mocks__/react-native-health-connect.ts (auto-resolved by Jest).

import {
  STEPS_GOAL,
  getTodayActivity,
  requestHealthPermissions,
  stepsToKcal,
} from "../healthManager";

// ─────────────────────────────────────────────────────────────────────────────
// stepsToKcal
// ─────────────────────────────────────────────────────────────────────────────

describe("stepsToKcal", () => {
  it("returns 0 for 0 steps", () => {
    expect(stepsToKcal(0)).toBe(0);
  });

  it("applies the 0.04 factor and rounds correctly", () => {
    expect(stepsToKcal(100)).toBe(4);    // 100 × 0.04 = 4.0  → 4
    expect(stepsToKcal(1000)).toBe(40);  // 1000 × 0.04 = 40  → 40
    expect(stepsToKcal(10_000)).toBe(400); // 10 000 × 0.04 = 400
  });

  it("rounds fractional results", () => {
    // 125 × 0.04 = 5.0  → 5  (exact)
    expect(stepsToKcal(125)).toBe(5);
    // 126 × 0.04 = 5.04 → 5  (rounds down)
    expect(stepsToKcal(126)).toBe(5);
    // 138 × 0.04 = 5.52 → 6  (rounds up)
    expect(stepsToKcal(138)).toBe(6);
  });

  it("handles typical daily step counts without overflow", () => {
    const result = stepsToKcal(20_000);
    expect(result).toBe(800);
    expect(Number.isFinite(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STEPS_GOAL
// ─────────────────────────────────────────────────────────────────────────────

describe("STEPS_GOAL", () => {
  it("equals 10 000 (WHO recommendation)", () => {
    expect(STEPS_GOAL).toBe(10_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTodayActivity — no-crash guarantee
// ─────────────────────────────────────────────────────────────────────────────

describe("getTodayActivity", () => {
  it("resolves to an object with numeric kcal and steps fields", async () => {
    const result = await getTodayActivity();

    expect(result).toBeDefined();
    expect(typeof result.kcal).toBe("number");
    expect(typeof result.steps).toBe("number");
  });

  it("never rejects (mock mode returns static values)", async () => {
    await expect(getTodayActivity()).resolves.not.toThrow();
  });

  it("returns non-negative values", async () => {
    const { kcal, steps } = await getTodayActivity();
    expect(kcal).toBeGreaterThanOrEqual(0);
    expect(steps).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requestHealthPermissions — no-crash guarantee
// ─────────────────────────────────────────────────────────────────────────────

describe("requestHealthPermissions", () => {
  it("resolves to a boolean", async () => {
    const result = await requestHealthPermissions();
    expect(typeof result).toBe("boolean");
  });

  it("never rejects", async () => {
    await expect(requestHealthPermissions()).resolves.not.toThrow();
  });
});
