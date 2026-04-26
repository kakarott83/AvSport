/**
 * Mock Health Service — Emulator / DEV mode only.
 *
 * Generates realistic-looking random fitness stats on every call so we can
 * watch all three SVG rings animate smoothly during development without
 * needing a real Android device with Health Connect installed.
 *
 * Integration contract:
 *   • lib/healthManager.ts imports this module and delegates all calls to it
 *     when USE_MOCK_DATA === true (or __DEV__ is true).
 *   • Never import this file from production code paths outside healthManager.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MockStats = {
  /** Steps walked today – range 1 000–12 000. */
  steps: number;
  /**
   * Active calories burned today.
   * Derived from steps (steps × 0.04) plus a random sport/workout offset
   * of 50–200 kcal so higher step counts still feel realistic when combined
   * with a gym session.
   */
  calories: number;
  /**
   * Protein consumed today in grams – range 20–160 g.
   * Not a real Health Connect field; included here so all three dashboard
   * rings (Calories, Steps, Protein) receive fresh values on each mock sync.
   */
  protein: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a random integer in [min, max] (inclusive). */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a fresh set of random but plausible daily fitness stats.
 * Called on every `getTodayStats()` invocation so each UI refresh shows
 * different ring fill levels.
 *
 * Ranges:
 *   steps    → 1 000 – 12 000
 *   calories → steps × 0.04  +  50–200 kcal sport bonus
 *   protein  → 20 – 160 g
 */
export function generateRandomStats(): MockStats {
  const steps    = randInt(1_000, 12_000);
  const calories = Math.round(steps * 0.04) + randInt(50, 200);
  const protein  = randInt(20, 160);

  if (__DEV__) {
    console.log(
      `[MockHealth] Generated → steps: ${steps}, kcal: ${calories}, protein: ${protein} g`,
    );
  }

  return { steps, calories, protein };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service object
// ─────────────────────────────────────────────────────────────────────────────

export const mockHealthService = {
  /** Always succeeds — no native SDK to initialise in dev. */
  async initialize(): Promise<boolean> {
    if (__DEV__) console.log("[MockHealth] initialize() → true");
    return true;
  },

  /** Always grants permissions — emulator has no permission dialog. */
  async requestPermissions(): Promise<boolean> {
    if (__DEV__) console.log("[MockHealth] requestPermissions() → true");
    return true;
  },

  /**
   * Returns freshly generated random stats.
   * Each call produces a different result so pull-to-refresh visibly
   * changes the ring values during UI testing.
   */
  async getTodayStats(): Promise<MockStats> {
    return generateRandomStats();
  },
};
