import * as Device from "expo-device";
import { Platform } from "react-native";

import { mockHealthService } from "@/services/mockHealthService";

// ─────────────────────────────────────────────────────────────────────────────
// Safe module load
//
// react-native-health-connect ships a native module that only exists on
// Android. A static top-level import touches the native bridge at parse-time
// and causes a null-pointer crash on iOS or any build where the native side
// is not linked. We require() behind a Platform guard so the module is only
// resolved when we are actually on Android.
// ─────────────────────────────────────────────────────────────────────────────

type HC = typeof import("react-native-health-connect");
let hc: HC | null = null;

if (Platform.OS === "android") {
  try {
    hc = require("react-native-health-connect") as HC;
  } catch {
    hc = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type AvailabilityReason =
  | "not_android" // running on iOS / web
  | "simulator" // emulator detected via expo-device
  | "module_not_found" // native bridge not linked
  | "sdk_unavailable" // Health Connect app not installed
  | "sdk_update_required" // Health Connect app is too old
  | "init_failed" // initialize() returned false or threw
  | "error"; // unexpected error in getSdkStatus()

export type HealthAvailability =
  | { available: true }
  | { available: false; reason: AvailabilityReason };

export type InitStatus = "idle" | "pending" | "ready" | "unavailable";

export type DateRange = {
  startTime: string; // ISO 8601, inclusive
  endTime: string; // ISO 8601, inclusive
};

export type StepsAndCalories = {
  steps: number;
  calories: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const STEPS_GOAL = 10_000;
const EMPTY_DATA = Object.freeze<StepsAndCalories>({ steps: 0, calories: 0 });
const USE_MOCK = false;

// ─────────────────────────────────────────────────────────────────────────────
// HealthManager singleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single access point for all Health Connect operations.
 *
 * Internal lifecycle:
 *   idle  ──init()──►  pending  ──success──►  ready
 *                                ──failure──►  unavailable
 *
 * All public methods are safe to call concurrently and from any render cycle.
 * They never throw — errors are caught, logged, and surfaced as false / 0 / EMPTY.
 */
export const HealthManager = {
  // ── Private state ──────────────────────────────────────────────────────────

  _status: "idle" as InitStatus,
  _initPromise: null as Promise<boolean> | null,
  // Tracks whether the native HealthConnectPermissionDelegate has finished
  // registering its ActivityResultLauncher (separate from SDK-init status).
  _isNativeReady: false,

  getStatus(): InitStatus {
    return this._status;
  },
  isReady(): boolean {
    return this._status === "ready";
  },
  isNativeReady(): boolean {
    return this._isNativeReady;
  },

  // ── init() ─────────────────────────────────────────────────────────────────

  /**
   * Prepares Health Connect for use on the current device.
   *
   * Order of checks:
   *   1. Platform must be Android
   *   2. Physical device (expo-device) — emulators crash on native HC calls
   *   3. Native module must have loaded (hc !== null)
   *   4. getSdkStatus() must return SDK_AVAILABLE
   *   5. initialize() must succeed
   *
   * Concurrent calls share the same Promise (mutex) so initialize() is
   * called exactly once per app lifetime.
   */
  async init(): Promise<boolean> {
    if (this._status === "ready") return true;
    if (this._status === "unavailable") return false;
    if (this._initPromise) return this._initPromise;

    this._status = "pending";
    this._initPromise = (async (): Promise<boolean> => {
      try {
        // Guard 1: Android only
        if (Platform.OS !== "android") {
          if (__DEV__)
            console.log("[HealthManager] init() skipped — not Android.");
          this._status = "unavailable";
          return false;
        }

        // Guard 2: physical device — emulators have no sensor stack or
        //          system Activity for Health Connect dialogs.
        if (!Device.isDevice) {
          if (__DEV__)
            console.log("[HealthManager] init() skipped — simulator detected.");
          this._status = "unavailable";
          return false;
        }

        // Guard 3: native module
        if (!hc) {
          console.error("[HealthManager] native module not loaded.");
          this._status = "unavailable";
          return false;
        }

        // Guard 4: SDK availability via getSdkStatus()
        if (__DEV__) console.log("[HealthManager] getSdkStatus()…");
        const status = await hc.getSdkStatus();
        const { SDK_AVAILABLE, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED } =
          hc.SdkAvailabilityStatus;

        if (status === SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
          console.warn("[HealthManager] Health Connect update required.");
          this._status = "unavailable";
          return false;
        }

        if (status !== SDK_AVAILABLE) {
          console.warn(`[HealthManager] SDK not available (status=${status}).`);
          this._status = "unavailable";
          return false;
        }

        // Guard 5: initialize()
        if (__DEV__) console.log("[HealthManager] initialize()…");
        const ok = await hc.initialize();

        if (!ok) {
          console.error("[HealthManager] initialize() returned false.");
          this._status = "unavailable";
          return false;
        }

        // The native HealthConnectPermissionDelegate registers its
        // ActivityResultLauncher (requestPermission lateinit var) via
        // onHostResume(). We yield here so the Android main-thread can
        // complete that registration before any requestPermission() call.
        // 1000 ms gives slow devices enough headroom for the Kotlin lifecycle.
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));

        this._isNativeReady = true;
        this._status = "ready";
        if (__DEV__) console.log("[HealthManager] ready ✓");
        return true;
      } catch (e) {
        console.error("[HealthManager] init() threw:", e);
        this._status = "unavailable";
        return false;
      } finally {
        this._initPromise = null;
      }
    })();

    return this._initPromise;
  },

  // ── requestPermissions() ───────────────────────────────────────────────────

  /**
   * Requests read access for Steps and ActiveCaloriesBurned.
   *
   * Calls init() internally — callers do not need to call init() first.
   * Returns true when permissions were granted (or in mock/DEV mode).
   */
  async requestPermissions(): Promise<boolean> {
    if (USE_MOCK) {
      if (__DEV__)
        console.log("[HealthManager] mock — requestPermissions() → true");
      return true;
    }

    try {
      const ready = await this.init();
      if (!ready) return false;

      // 1. ZUSÄTZLICHER SICHERHEITS-PUFFER
      // Wir warten hier nochmal explizit, bevor wir die native Brücke überqueren.
      console.log(
        "[HealthManager] Waiting for Android activity to stabilize...",
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (!this._isNativeReady || !hc) {
        console.error(
          "[HealthManager] requestPermissions() aborted — native launcher not attached.",
        );
        return false;
      }

      if (__DEV__)
        console.log(
          "[HealthManager] requestPermission() — opening system dialog…",
        );

      // 2. DER KRITISCHE AUFRUF
      await hc.requestPermission([
        { accessType: "read", recordType: "Steps" },
        { accessType: "read", recordType: "ActiveCaloriesBurned" },
      ]);

      return true;
    } catch (e) {
      console.error("[HealthManager] requestPermissions() threw:", e);
      // Reset
      this._isNativeReady = false;
      this._status = "idle";
      this._initPromise = null;
      return false;
    }
  },

  // ── getStepsToday() ────────────────────────────────────────────────────────

  /**
   * Returns the total step count from midnight today until now.
   *
   * Time range is computed locally (device time), matching what the user
   * expects to see in their Health Connect timeline.
   *
   * Returns 0 when:
   *   • running in a simulator (Device.isDevice === false)
   *   • Health Connect is not installed / not yet permitted
   *   • readRecords() throws for any reason
   */
  async getStepsToday(): Promise<number> {
    if (USE_MOCK) {
      const { steps } = await mockHealthService.getTodayStats();
      return steps;
    }

    // Simulator guard — identical to the one in init(), but explicit here so
    // callers that skip init() (e.g. read-only background fetches) are safe.
    if (!Device.isDevice) {
      if (__DEV__)
        console.log(
          "[HealthManager] getStepsToday() — simulator, returning 0.",
        );
      return 0;
    }

    try {
      const ready = await this.init();
      if (!ready) return 0;

      // Midnight of the current day in local time
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);

      const timeRangeFilter = {
        operator: "between" as const,
        startTime: midnight.toISOString(),
        endTime: now.toISOString(),
      };

      if (__DEV__)
        console.log("[HealthManager] readRecords('Steps')…", timeRangeFilter);

      const result = await hc!.readRecords("Steps", { timeRangeFilter });

      // readRecords returns a wide union — cast to access Steps-specific .count
      const total = (result.records as any[]).reduce(
        (sum, record) => sum + (record.count ?? 0),
        0,
      );

      if (__DEV__) console.log(`[HealthManager] steps today: ${total}`);
      return total;
    } catch (e) {
      console.error("[HealthManager] getStepsToday() threw:", e);
      return 0;
    }
  },

  // ── fetchStepsAndCalories() ────────────────────────────────────────────────

  /**
   * Reads both Steps and ActiveCaloriesBurned for an arbitrary date range.
   * Returns EMPTY_DATA on any failure — never throws.
   */
  async fetchStepsAndCalories(dateRange: DateRange): Promise<StepsAndCalories> {
    if (USE_MOCK) {
      const { steps, calories } = await mockHealthService.getTodayStats();
      return { steps, calories };
    }

    if (!Device.isDevice) return { ...EMPTY_DATA };

    try {
      const ready = await this.init();
      if (!ready) return { ...EMPTY_DATA };

      const timeRangeFilter = {
        operator: "between" as const,
        startTime: dateRange.startTime,
        endTime: dateRange.endTime,
      };

      const [stepsRes, caloriesRes] = await Promise.all([
        hc!.readRecords("Steps", { timeRangeFilter }),
        hc!.readRecords("ActiveCaloriesBurned", { timeRangeFilter }),
      ]);

      const steps = (stepsRes.records as any[]).reduce(
        (s, r) => s + (r.count ?? 0),
        0,
      );
      const calories = (caloriesRes.records as any[]).reduce(
        (s, r) => s + (r.energy?.inKilocalories ?? 0),
        0,
      );

      return { steps, calories: Math.round(calories) };
    } catch (e) {
      console.error("[HealthManager] fetchStepsAndCalories() threw:", e);
      return { ...EMPTY_DATA };
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Named exports — backward-compatible wrappers used by existing consumers
// (useHealthData.ts, profile.tsx).  They delegate to HealthManager so there
// is exactly one code path for every native call.
// ─────────────────────────────────────────────────────────────────────────────

export async function checkAvailability(): Promise<HealthAvailability> {
  if (Platform.OS !== "android")
    return { available: false, reason: "not_android" };
  if (!Device.isDevice) return { available: false, reason: "simulator" };
  if (!hc) return { available: false, reason: "module_not_found" };

  try {
    const status = await hc.getSdkStatus();
    const { SDK_AVAILABLE, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED } =
      hc.SdkAvailabilityStatus;

    if (status === SDK_AVAILABLE) return { available: true };
    if (status === SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
      return { available: false, reason: "sdk_update_required" };

    return { available: false, reason: "sdk_unavailable" };
  } catch {
    return { available: false, reason: "error" };
  }
}

/** @deprecated  Use HealthManager.requestPermissions() */
export const requestPermissions = () => HealthManager.requestPermissions();
/** @deprecated  Use HealthManager.requestPermissions() */
export const requestHealthPermissions = () =>
  HealthManager.requestPermissions();
/** @deprecated  Use HealthManager.fetchStepsAndCalories() */
export const fetchStepsAndCalories = (r: DateRange) =>
  HealthManager.fetchStepsAndCalories(r);

/** Used by useHealthData — keeps the hook working without changes. */
export async function getTodayActivity(): Promise<{
  kcal: number;
  steps: number;
  protein: number;
}> {
  try {
    if (USE_MOCK) {
      const { steps, calories, protein } =
        await mockHealthService.getTodayStats();
      return { kcal: calories, steps, protein };
    }

    const now = new Date();
    const startTime = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const endTime = now.toISOString();

    const { steps, calories } = await HealthManager.fetchStepsAndCalories({
      startTime,
      endTime,
    });
    return { kcal: calories, steps, protein: 0 };
  } catch {
    return { kcal: 0, steps: 0, protein: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step utilities
// ─────────────────────────────────────────────────────────────────────────────

export function stepsToKcal(steps: number): number {
  return Math.round(steps * 0.04);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard integration example
//
// Copy this pattern into any screen that needs live step data:
//
//   import { HealthManager } from '@/lib/healthManager';
//
//   function DashboardScreen() {
//     const [steps, setSteps] = useState(0);
//
//     useEffect(() => {
//       let cancelled = false;
//
//       async function load() {
//         const count = await HealthManager.getStepsToday();
//         if (!cancelled) setSteps(count);
//       }
//
//       load();
//       return () => { cancelled = true; };
//     }, []);
//
//     // Pull-to-refresh version:
//     async function onRefresh() {
//       const count = await HealthManager.getStepsToday();
//       setSteps(count);
//     }
//
//     return <StepRing steps={steps} goal={STEPS_GOAL} />;
//   }
// ─────────────────────────────────────────────────────────────────────────────
