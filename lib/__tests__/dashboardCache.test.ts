/**
 * Unit tests for lib/dashboardCache.ts
 *
 * Covered:
 * 1. saveCache  – persists data to AsyncStorage with a cachedAt timestamp
 * 2. loadCache  – reads and parses the stored value; returns null if absent
 * 3. isStale    – true when age > 5 min, false when fresh
 * 4. Offline scenario  – cache acts as fallback when no live data is available
 * 5. Data merge – live data overwrites a previously cached snapshot
 * 6. Max-age    – entries older than 24 h are discarded (returns null)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CachedDashboard } from "../dashboardCache";
import { isStale, loadCache, saveCache } from "../dashboardCache";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A valid snapshot with all required fields. */
const SAMPLE: Omit<CachedDashboard, "cachedAt"> = {
  todayKcal: 1200,
  todayProtein: 80,
  burnedKcal: 345,
  proteinGoal: 150,
  healthSteps: 6420,
  healthBurnKcal: 345,
};

// Type-cast so tests can call __reset without TypeScript errors.
const storage = AsyncStorage as unknown as {
  __reset(): void;
  getItem: jest.Mock;
  setItem: jest.Mock;
};

beforeEach(() => {
  storage.__reset();
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// saveCache
// ─────────────────────────────────────────────────────────────────────────────

describe("saveCache", () => {
  it("calls AsyncStorage.setItem with the correct key", async () => {
    await saveCache(SAMPLE);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [key] = storage.setItem.mock.calls[0];
    expect(key).toBe("@avora/dashboard_v1");
  });

  it("stores a JSON string that includes all snapshot fields", async () => {
    await saveCache(SAMPLE);
    const [, value] = storage.setItem.mock.calls[0];
    const parsed: CachedDashboard = JSON.parse(value);

    expect(parsed.todayKcal).toBe(SAMPLE.todayKcal);
    expect(parsed.todayProtein).toBe(SAMPLE.todayProtein);
    expect(parsed.burnedKcal).toBe(SAMPLE.burnedKcal);
    expect(parsed.proteinGoal).toBe(SAMPLE.proteinGoal);
    expect(parsed.healthSteps).toBe(SAMPLE.healthSteps);
    expect(parsed.healthBurnKcal).toBe(SAMPLE.healthBurnKcal);
  });

  it("attaches a cachedAt timestamp close to Date.now()", async () => {
    const before = Date.now();
    await saveCache(SAMPLE);
    const after = Date.now();

    const [, value] = storage.setItem.mock.calls[0];
    const { cachedAt } = JSON.parse(value) as CachedDashboard;

    expect(cachedAt).toBeGreaterThanOrEqual(before);
    expect(cachedAt).toBeLessThanOrEqual(after);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadCache
// ─────────────────────────────────────────────────────────────────────────────

describe("loadCache", () => {
  it("returns null when nothing is stored", async () => {
    const result = await loadCache();
    expect(result).toBeNull();
  });

  it("returns the stored snapshot when fresh", async () => {
    await saveCache(SAMPLE);
    const result = await loadCache();

    expect(result).not.toBeNull();
    expect(result!.todayKcal).toBe(SAMPLE.todayKcal);
    expect(result!.healthSteps).toBe(SAMPLE.healthSteps);
  });

  it("returns null when the cache is older than 24 hours", async () => {
    // Store a snapshot manually with a stale timestamp.
    const staleEntry: CachedDashboard = {
      ...SAMPLE,
      cachedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 h ago
    };
    await AsyncStorage.setItem(
      "@avora/dashboard_v1",
      JSON.stringify(staleEntry),
    );

    const result = await loadCache();
    expect(result).toBeNull();
  });

  it("returns null when AsyncStorage contains invalid JSON", async () => {
    await AsyncStorage.setItem("@avora/dashboard_v1", "not-json{{{");
    const result = await loadCache();
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isStale
// ─────────────────────────────────────────────────────────────────────────────

describe("isStale", () => {
  it("returns false for a timestamp from 1 minute ago", () => {
    const cachedAt = Date.now() - 60 * 1000; // 1 min
    expect(isStale(cachedAt)).toBe(false);
  });

  it("returns false for a timestamp from exactly 4 minutes ago", () => {
    const cachedAt = Date.now() - 4 * 60 * 1000;
    expect(isStale(cachedAt)).toBe(false);
  });

  it("returns true for a timestamp from 6 minutes ago", () => {
    const cachedAt = Date.now() - 6 * 60 * 1000;
    expect(isStale(cachedAt)).toBe(true);
  });

  it("returns true for a very old timestamp", () => {
    const cachedAt = Date.now() - 12 * 60 * 60 * 1000; // 12 h
    expect(isStale(cachedAt)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Offline scenario – cache as fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("Offline scenario", () => {
  it("returns cached data when the live fetch would fail", async () => {
    // Pre-populate cache (simulates a previous successful fetch).
    await saveCache(SAMPLE);

    // Simulate offline: live fetch throws.
    const fetchLiveData = jest.fn().mockRejectedValue(new Error("network error"));

    let dashboard: CachedDashboard | null = null;

    // App logic: try live, fall back to cache.
    try {
      await fetchLiveData();
    } catch {
      dashboard = await loadCache();
    }

    expect(dashboard).not.toBeNull();
    expect(dashboard!.todayKcal).toBe(SAMPLE.todayKcal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Data merge – live data overwrites cache
// ─────────────────────────────────────────────────────────────────────────────

describe("Data merge", () => {
  it("live data overwrites the stale cached snapshot", async () => {
    // Step 1: write an old snapshot.
    await saveCache(SAMPLE);

    // Step 2: live fetch returns updated numbers.
    const liveData: Omit<CachedDashboard, "cachedAt"> = {
      ...SAMPLE,
      todayKcal: 1800,
      healthSteps: 9500,
    };
    await saveCache(liveData);

    // Step 3: load should return the newest snapshot.
    const cached = await loadCache();
    expect(cached).not.toBeNull();
    expect(cached!.todayKcal).toBe(1800);
    expect(cached!.healthSteps).toBe(9500);
    // Unchanged fields are preserved.
    expect(cached!.todayProtein).toBe(SAMPLE.todayProtein);
  });
});
