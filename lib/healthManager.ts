import * as Device from "expo-device";
import { AppState, NativeModules, Platform } from "react-native";

import {
  expandDays,
  localISODate,
  mapHealthConnectFlow,
  mapHealthKitFlow,
  mergeHealthDays,
  type HealthCycleDay,
} from "@/lib/cycleHealth";
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

// Same pattern for Apple HealthKit (react-native-health) on iOS. The module
// exposes callback-style methods; see the promise wrappers below.
type AHK = typeof import("react-native-health").default;
let ahk: AHK | null = null;

if (Platform.OS === "ios") {
  // Use the native module directly instead of react-native-health's index.js:
  // that wrapper builds its export via Object.assign({}, AppleHealthKit), and
  // under the New Architecture the module is a JSI host object whose methods
  // are not enumerable — the copy ends up without initHealthKit & co.
  const native = NativeModules.AppleHealthKit as AHK | undefined;
  // The JS side can exist even when the native side is not linked.
  ahk = typeof native?.initHealthKit === "function" ? native : null;
}

/** Promise wrapper for react-native-health's (err, result) callbacks. */
function hk<T>(call: (cb: (err: unknown, res: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    call((err, res) => (err ? reject(err) : resolve(res))),
  );
}

const HK_READ_PERMISSIONS = ["Steps", "ActiveEnergyBurned"];
// "MenstrualFlow" needs patches/react-native-health+1.19.0.patch (permission + getMenstrualFlowSamples).
const HK_CYCLE_PERMISSIONS = ["MenstrualFlow"];
const HC_CYCLE_RECORDS = ["MenstruationFlow", "MenstruationPeriod"];

/** Sums Steps + ActiveEnergyBurned from HealthKit for the given range. */
async function fetchHealthKit(range: DateRange): Promise<StepsAndCalories> {
  if (!ahk) return { ...EMPTY_DATA };
  const options = { startDate: range.startTime, endDate: range.endTime };
  const [stepSamples, energySamples] = await Promise.all([
    hk<{ value: number }[]>((cb) => ahk!.getDailyStepCountSamples(options as any, cb as any)),
    hk<{ value: number }[]>((cb) => ahk!.getActiveEnergyBurned(options as any, cb as any)),
  ]);
  const sum = (rows: { value: number }[] | null | undefined) =>
    (rows ?? []).reduce((s, r) => s + (Number(r.value) || 0), 0);
  return {
    steps: Math.round(sum(stepSamples)),
    calories: Math.round(sum(energySamples)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type AvailabilityReason =
  | "not_android" // running on web (or an unsupported platform)
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
        // iOS: HealthKit. Read permissions are requested in
        // requestPermissions(); here we only check that HealthKit exists.
        if (Platform.OS === "ios") {
          if (!ahk) {
            if (__DEV__)
              console.log("[HealthManager] init() skipped — HealthKit not available.");
            this._status = "unavailable";
            return false;
          }
          const available = await hk<boolean>((cb) => ahk!.isAvailable(cb as any));
          if (!available) {
            this._status = "unavailable";
            return false;
          }
          this._isNativeReady = true;
          this._status = "ready";
          return true;
        }

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
    return this._requestRead(HK_READ_PERMISSIONS, ["Steps", "ActiveCaloriesBurned"]);
  },

  /**
   * Requests read access for menstruation data (Zykluskalender). Separate from
   * requestPermissions() so Steps users are not asked for cycle data.
   */
  async requestMenstruationPermission(): Promise<boolean> {
    return this._requestRead(HK_CYCLE_PERMISSIONS, HC_CYCLE_RECORDS);
  },

  /**
   * Shared permission flow. iOS: HealthKit sheet for `hkRead`. Android: Health
   * Connect dialog for `hcRecords` (success = at least one of them granted).
   */
  async _requestRead(hkRead: string[], hcRecords: string[]): Promise<boolean> {
    const isGranted = (perms: any[]) =>
      perms.some((p) => p.accessType === "read" && hcRecords.includes(p.recordType));

    try {
      const ready = await this.init();
      if (!ready) return false;

      // iOS: initHealthKit shows the HealthKit sheet once. HealthKit never
      // reveals whether *read* access was granted, so success = sheet handled.
      if (Platform.OS === "ios") {
        if (!ahk) return false;
        await hk((cb) =>
          ahk!.initHealthKit(
            { permissions: { read: hkRead, write: [] } } as any,
            cb as any,
          ),
        );
        return true;
      }

      // Fast path: if permissions are already granted (e.g. user just came back
      // from HC settings), skip the dialog entirely.
      if (hc) {
        const already = await hc.getGrantedPermissions();
        if (isGranted(already as any[])) {
          if (__DEV__)
            console.log(
              "[HealthManager] permissions already granted — skipping dialog.",
            );
          return true;
        }
      }

      // Wait until the Android Activity is in the foreground. This is the
      // reliable signal that onHostResume() has fired and the Kotlin
      // HealthConnectPermissionDelegate.requestPermission lateinit var has
      // been assigned by registerForActivityResult().
      // A hardcoded setTimeout is not sufficient on slower devices or inside
      // the Expo DevLauncher where the lifecycle fires later than expected.
      if (AppState.currentState !== "active") {
        if (__DEV__)
          console.log(
            "[HealthManager] waiting for AppState → active before requestPermission…",
          );
        await new Promise<void>((resolve, reject) => {
          const guard = setTimeout(
            () => reject(new Error("AppState active timeout")),
            10_000,
          );
          const sub = AppState.addEventListener("change", (state) => {
            if (state === "active") {
              clearTimeout(guard);
              sub.remove();
              resolve();
            }
          });
        });
      }

      // Small buffer so the Kotlin main-thread can finish the ActivityResultLauncher
      // registration that happens synchronously inside onHostResume().
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (!hc) return false;

      if (__DEV__)
        console.log(
          "[HealthManager] requestPermission() — opening system dialog…",
        );

      // Retry loop: guards against residual cases where the lateinit var is
      // still not ready even after the foreground signal (e.g. Expo DevLauncher
      // double-Activity wrap delays the delegate attachment by another frame).
      const MAX_ATTEMPTS = 6;
      const RETRY_DELAY_MS = 1000;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const granted = await hc.requestPermission(
            hcRecords.map((recordType) => ({ accessType: "read", recordType })) as any,
          );

          if (__DEV__)
            console.log(
              "[HealthManager] requestPermission result:",
              JSON.stringify(granted),
            );

          if (granted.length > 0) return true;

          // On Android 14 the system Health Connect service returns RESULT_OK
          // but with no extras in the Intent, so parseResult() yields an empty
          // set even when the user actually granted. Cross-check with the OS.
          const actual = await hc.getGrantedPermissions();
          if (__DEV__)
            console.log(
              "[HealthManager] getGrantedPermissions fallback:",
              JSON.stringify(actual),
            );
          return isGranted(actual as any[]);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e ?? "");
          const isLateInitError =
            message.includes("UninitializedPropertyAccessException") ||
            message.includes("lateinit property requestPermission");

          if (isLateInitError && attempt < MAX_ATTEMPTS) {
            console.warn(
              `[HealthManager] requestPermission lateinit not ready` +
                ` (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${RETRY_DELAY_MS} ms…`,
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
            if (isLateInitError) {
              console.warn(
                "[HealthManager] requestPermission lateinit still not ready" +
                  ` after ${MAX_ATTEMPTS} attempts — aborting without crash.`,
              );
              return false;
            }
            throw e;
          }
        }
      }

      return false;
    } catch (e) {
      console.error("[HealthManager] _requestRead() threw:", e);
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
    if (Platform.OS === "android" && !Device.isDevice) {
      if (__DEV__)
        console.log(
          "[HealthManager] getStepsToday() — simulator, returning 0.",
        );
      return 0;
    }

    try {
      const ready = await this.init();
      if (!ready) return 0;

      if (Platform.OS === "ios") {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        const { steps } = await fetchHealthKit({
          startTime: midnight.toISOString(),
          endTime: new Date().toISOString(),
        });
        return steps;
      }

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
        console.log("[HealthManager] aggregateRecord('Steps')…", timeRangeFilter);

      const result = await hc!.aggregateRecord({
        recordType: "Steps",
        timeRangeFilter,
        dataOriginFilter: ["com.google.android.apps.fitness"],
      });

      const total = (result as any).COUNT_TOTAL ?? 0;

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

    if (Platform.OS === "android" && !Device.isDevice) return { ...EMPTY_DATA };

    try {
      const ready = await this.init();
      if (!ready) return { ...EMPTY_DATA };

      if (Platform.OS === "ios") return await fetchHealthKit(dateRange);

      const timeRangeFilter = {
        operator: "between" as const,
        startTime: dateRange.startTime,
        endTime: dateRange.endTime,
      };

      const stepsRes = await hc!.aggregateRecord({
        recordType: "Steps",
        timeRangeFilter,
        dataOriginFilter: ["com.google.android.apps.fitness"],
      });

      const steps    = (stepsRes as any).COUNT_TOTAL ?? 0;
      const calories = Math.round(steps * 0.04);

      if (__DEV__)
        console.log(`[HealthManager] Steps (Fit): ${steps}, kcal (derived): ${calories}`);

      return { steps, calories };
    } catch (e) {
      console.error("[HealthManager] fetchStepsAndCalories() threw:", e);
      return { ...EMPTY_DATA };
    }
  },

  // ── Menstruation (Zykluskalender) ──────────────────────────────────────────

  /**
   * Android: whether menstruation read access is granted. iOS cannot tell
   * (HealthKit hides read status) → null; callers track that themselves.
   */
  async hasMenstruationPermission(): Promise<boolean | null> {
    if (Platform.OS === "ios") return null;
    if (Platform.OS !== "android" || !Device.isDevice) return false;
    try {
      if (!(await this.init()) || !hc) return false;
      const granted = await hc.getGrantedPermissions();
      return (granted as any[]).some(
        (p) => p.accessType === "read" && HC_CYCLE_RECORDS.includes(p.recordType),
      );
    } catch {
      return false;
    }
  },

  /**
   * Bleeding days (local date + app flow 1–4) in the given range.
   * Returns null when the data could not be read (unavailable, no permission,
   * error) — callers must then NOT treat it as "no bleeding days".
   */
  async fetchMenstruationDays(range: DateRange): Promise<HealthCycleDay[] | null> {
    if (USE_MOCK) return null;
    if (Platform.OS === "android" && !Device.isDevice) return null;
    try {
      if (!(await this.init())) return null;

      if (Platform.OS === "ios") {
        if (!ahk || typeof (ahk as any).getMenstrualFlowSamples !== "function") return null;
        const samples = await hk<{ startDate: string; value: number }[]>((cb) =>
          (ahk as any).getMenstrualFlowSamples(
            { startDate: range.startTime, endDate: range.endTime },
            cb,
          ),
        );
        const days: HealthCycleDay[] = [];
        for (const s of samples ?? []) {
          const flow = mapHealthKitFlow(Number(s.value));
          if (flow != null) days.push({ date: localISODate(new Date(s.startDate)), flow });
        }
        return mergeHealthDays(days);
      }

      if (!hc || !(await this.hasMenstruationPermission())) return null;
      const timeRangeFilter = {
        operator: "between" as const,
        startTime: range.startTime,
        endTime: range.endTime,
      };
      const [flowRes, periodRes] = await Promise.all([
        hc.readRecords("MenstruationFlow", { timeRangeFilter }),
        hc.readRecords("MenstruationPeriod", { timeRangeFilter }).catch(() => ({ records: [] })),
      ]);

      const days: HealthCycleDay[] = [];
      for (const r of (flowRes as any).records ?? []) {
        days.push({ date: localISODate(new Date(r.time)), flow: mapHealthConnectFlow(r.flow) });
      }
      // Periods are intervals (endTime exclusive); days without a flow record count as "Leicht".
      for (const r of (periodRes as any).records ?? []) {
        const start = r.startTime ?? r.time;
        if (!start) continue;
        const endExclusive = new Date(r.endTime ?? start);
        const last = r.endTime ? new Date(endExclusive.getTime() - 1) : endExclusive;
        for (const date of expandDays(localISODate(new Date(start)), localISODate(last))) {
          days.push({ date, flow: 2 });
        }
      }
      return mergeHealthDays(days);
    } catch (e) {
      console.warn("[HealthManager] fetchMenstruationDays() failed:", e);
      return null;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Named exports — backward-compatible wrappers used by existing consumers
// (useHealthData.ts, profile.tsx).  They delegate to HealthManager so there
// is exactly one code path for every native call.
// ─────────────────────────────────────────────────────────────────────────────

export async function checkAvailability(): Promise<HealthAvailability> {
  if (Platform.OS === "ios") {
    if (!ahk) return { available: false, reason: "module_not_found" };
    try {
      const ok = await hk<boolean>((cb) => ahk!.isAvailable(cb as any));
      return ok ? { available: true } : { available: false, reason: "sdk_unavailable" };
    } catch {
      return { available: false, reason: "error" };
    }
  }
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

/**
 * Returns true when Google Fit has written step data to Health Connect within
 * the last 30 days — meaning it is installed AND connected to Health Connect.
 * Returns false when Google Fit is missing or has never synced.
 */
export async function checkGoogleFitConnected(): Promise<boolean> {
  if (Platform.OS !== "android" || !hc) return false;
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = await hc.aggregateRecord({
      recordType: "Steps",
      timeRangeFilter: {
        operator: "between",
        startTime: thirtyDaysAgo.toISOString(),
        endTime: now.toISOString(),
      },
    });
    return (
      (result as any).dataOrigins?.includes(
        "com.google.android.apps.fitness",
      ) ?? false
    );
  } catch {
    return false;
  }
}

/** Opens the Health Connect settings screen so the user can manage app permissions. */
export function openHealthConnectSettings(): void {
  if (Platform.OS !== "android" || !hc) return;
  hc.openHealthConnectSettings();
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
