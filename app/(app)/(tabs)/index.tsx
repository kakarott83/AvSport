import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LineChart } from "react-native-gifted-charts";
import Animated, {
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { FoodScanner } from "@/components/FoodScanner";
import { Toast } from "@/components/Toast";
import { useCalorieGoal } from "@/hooks/useCalorieGoal";
import { useHealthData } from "@/hooks/useHealthData";
import { useStepGoal } from "@/hooks/useStepGoal";
import { useWaterIntake } from "@/hooks/useWaterIntake";
import { isStale, loadCache, saveCache } from "@/lib/dashboardCache";
import { clearCredentials } from "@/lib/credentialStore";
import { HealthManager } from "@/lib/healthManager";
import { syncHealthToSupabase } from "@/lib/healthSync";
import { resolveDayIndexForDate } from "@/services/gemini/trainingProvider";
import { supabase } from "@/services/supabaseClient";
import type { FoodAnalysis } from "@/types/vision";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type Profile = {
  display_name: string | null;
  weight_kg: number | null;
  protein_per_kg: number | null;
};

type WeightEntry = { value: number; measured_at: string };
type Plan = { id: string; title: string; scheduled_days: number[] | null };
type DailyLogRow = { date: string; tags: string[] | null };
type WeightTagInfo = { period: boolean; alcohol: boolean };

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const CHART_W = Dimensions.get("window").width - 88;
const CHART_H = 90; // LineChart height prop
const YAXIS_W = 35; // gifted-charts default yAxisLabelWidth

const RING_SIZE = 168;
const R_OUT = 76;
const W_OUT = 11;
const R_MID = 62;
const W_MID = 10;
const R_IN = 48;
const W_IN = 9;
const R_H2O = 35;
const W_H2O = 8;

const CIRC_OUT = 2 * Math.PI * R_OUT;
const CIRC_MID = 2 * Math.PI * R_MID;
const CIRC_IN = 2 * Math.PI * R_IN;
const CIRC_H2O = 2 * Math.PI * R_H2O;

const SPRING_CFG = {
  damping: 14,
  stiffness: 55,
  overshootClamping: false,
} as const;

const COLOR_CALORIES = "#00E5FF"; // allgemeiner UI-Akzent (Buttons, Chart, Links)
const COLOR_STEPS    = "#FF9100";
const COLOR_PROTEIN  = "#FF5252";
const COLOR_WATER    = "#29B6F6";
/** Kalorien-Ring: kräftiges Grün, klar getrennt vom Wasser-Blau. */
const COLOR_CAL_RING = "#22C55E";

// Tag IDs as defined in calendar.tsx DEFAULT_TAGS
const TAG_ID_PERIOD = "period";
const TAG_ID_ALCOHOL = "no_alcohol";

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}
function sixtyDaysAgoISO() {
  return new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
}

function calcProteinGoal(p: Profile): number {
  if (!p.weight_kg) return 0;
  return Math.round(p.weight_kg * (p.protein_per_kg ?? 2.0));
}

const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function nextScheduledDayName(
  scheduledDays: number[] | null | undefined,
): string | null {
  if (!scheduledDays || scheduledDays.length === 0) return null;
  const today = new Date().getDay();
  for (let i = 1; i <= 7; i++) {
    const candidate = (today + i) % 7;
    if (scheduledDays.includes(candidate)) return DAY_NAMES[candidate];
  }
  return null;
}

function isoToLabel(iso: string): string {
  return iso.substring(8, 10) + "." + iso.substring(5, 7) + ".";
}

/**
 * Build chart data with per-point colors + date field for tooltip.
 * Period  → red  (#FF5252)
 * Alcohol → yellow (#FFD600)
 * Normal  → white
 */
function toChartData(
  entries: WeightEntry[],
  tagMap: Map<string, WeightTagInfo>,
) {
  const step = entries.length > 8 ? Math.ceil(entries.length / 6) : 1;
  return entries.map((e, i) => {
    const date = e.measured_at.slice(0, 10);
    const info = tagMap.get(date);
    let dataPointColor = "#fff";
    let dataPointRadius = 3;
    if (info?.period) {
      dataPointColor = "#FF5252";
      dataPointRadius = 5;
    } else if (info?.alcohol) {
      dataPointColor = "#FFD600";
      dataPointRadius = 5;
    }
    return {
      value: e.value,
      label: i % step === 0 ? isoToLabel(e.measured_at) : "",
      dataPointText: "",
      dataPointColor,
      dataPointRadius,
      date, // used by pointerLabelComponent
    };
  });
}

/**
 * For each tagged data point, compute an absolute-positioned background strip.
 * Strips sit behind the chart at the x-position of the tagged measurement.
 */
function buildChartStrips(
  entries: WeightEntry[],
  tagMap: Map<string, WeightTagInfo>,
): { left: number; width: number; color: string }[] {
  if (entries.length < 2) return [];
  const spacing = (CHART_W - 24) / (entries.length - 1);
  return entries.flatMap((e, i) => {
    const info = tagMap.get(e.measured_at.slice(0, 10));
    if (!info?.period && !info?.alcohol) return [];
    const cx = 12 + i * spacing;
    const left = Math.max(0, cx - spacing / 2);
    const right = Math.min(CHART_W, cx + spacing / 2);
    return [
      {
        left,
        width: right - left,
        color: info.period ? "rgba(255,82,82,0.13)" : "rgba(255,213,0,0.09)",
      },
    ];
  });
}

/**
 * Compute a human-readable weight insight.
 * Priority 1 – period correlation via average comparison (needs ≥2 period entries).
 * Priority 2 – single largest jump correlated with period or alcohol.
 */
function computeWeightInsight(
  entries: WeightEntry[],
  tagMap: Map<string, WeightTagInfo>,
): string | null {
  if (entries.length < 3) return null;

  const periodEntries = entries.filter(
    (e) => tagMap.get(e.measured_at.slice(0, 10))?.period,
  );
  const normalEntries = entries.filter(
    (e) => !tagMap.get(e.measured_at.slice(0, 10))?.period,
  );

  // Correlation analysis: enough data on both sides?
  if (periodEntries.length >= 2 && normalEntries.length >= 2) {
    const avgP =
      periodEntries.reduce((s, e) => s + e.value, 0) / periodEntries.length;
    const avgN =
      normalEntries.reduce((s, e) => s + e.value, 0) / normalEntries.length;
    if (avgP - avgN > 0.3) {
      const lo = Math.min(...periodEntries.map((e) => e.value));
      const hi = Math.max(...periodEntries.map((e) => e.value));
      return `💡 Deine Gewichtsschwankungen von ca. ${(hi - lo).toFixed(1)} kg treten zeitgleich mit deiner Periode auf. Das sind hormonell bedingte Wassereinlagerungen – kein Fettaufbau.`;
    }
  }

  // Fallback: single largest jump
  let maxJump = 0,
    maxIdx = -1;
  for (let i = 1; i < entries.length; i++) {
    const d = entries[i].value - entries[i - 1].value;
    if (d > maxJump) {
      maxJump = d;
      maxIdx = i;
    }
  }
  if (maxJump >= 0.5 && maxIdx >= 0) {
    const d1 = entries[maxIdx].measured_at.slice(0, 10);
    const d2 = entries[maxIdx - 1].measured_at.slice(0, 10);
    if (tagMap.get(d1)?.period || tagMap.get(d2)?.period)
      return `💡 Dein Gewichtssprung von +${maxJump.toFixed(1)} kg korreliert mit deiner Periode 🩸 – meist Wassereinlagerung, kein Grund zur Sorge.`;
    if (tagMap.get(d1)?.alcohol || tagMap.get(d2)?.alcohol)
      return `💡 Dein Gewichtssprung von +${maxJump.toFixed(1)} kg fällt auf einen Tag mit Alkohol 🍷 – oft kurzfristige Wassereinlagerung.`;
  }

  return null;
}

// ─────────────────────────────────────────
// AnimatedCircle
// ─────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─────────────────────────────────────────
// TripleRing
// ─────────────────────────────────────────

function GoalRings({
  calorieProgress,
  stepsProgress,
  proteinProgress,
  waterProgress,
  remaining,
}: {
  calorieProgress: number;
  stepsProgress: number;
  proteinProgress: number;
  waterProgress: number;
  remaining: number;
}) {
  const offOut = useSharedValue(CIRC_OUT);
  const offMid = useSharedValue(CIRC_MID);
  const offIn = useSharedValue(CIRC_IN);
  const offH2o = useSharedValue(CIRC_H2O);

  useEffect(() => {
    offOut.value = withSpring(
      CIRC_OUT * (1 - Math.min(calorieProgress, 1)),
      SPRING_CFG,
    );
    offMid.value = withSpring(
      CIRC_MID * (1 - Math.min(stepsProgress, 1)),
      SPRING_CFG,
    );
    offIn.value = withSpring(
      CIRC_IN * (1 - Math.min(proteinProgress, 1)),
      SPRING_CFG,
    );
    offH2o.value = withSpring(
      CIRC_H2O * (1 - Math.min(waterProgress, 1)),
      SPRING_CFG,
    );
  }, [calorieProgress, stepsProgress, proteinProgress, waterProgress]);

  const propsOut = useAnimatedProps(() => ({ strokeDashoffset: offOut.value }));
  const propsMid = useAnimatedProps(() => ({ strokeDashoffset: offMid.value }));
  const propsIn  = useAnimatedProps(() => ({ strokeDashoffset: offIn.value  }));
  const propsH2o = useAnimatedProps(() => ({ strokeDashoffset: offH2o.value }));

  const displayRemaining = remaining < 0 ? 0 : remaining;

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        {/* Hintergrund-Ringe */}
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_OUT} stroke="#1a2a2a" strokeWidth={W_OUT} fill="none" />
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_MID} stroke="#2a1a08" strokeWidth={W_MID} fill="none" />
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_IN}  stroke="#2a0d0d" strokeWidth={W_IN}  fill="none" />
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_H2O} stroke="#0a1f28" strokeWidth={W_H2O} fill="none" />
        {/* Animierte Fortschritts-Ringe */}
        <AnimatedCircle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_OUT}
          stroke={COLOR_CAL_RING} strokeWidth={W_OUT} fill="none"
          strokeDasharray={CIRC_OUT} strokeLinecap="round"
          animatedProps={propsOut}
        />
        <AnimatedCircle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_MID}
          stroke={COLOR_STEPS} strokeWidth={W_MID} fill="none"
          strokeDasharray={CIRC_MID} strokeLinecap="round"
          animatedProps={propsMid}
        />
        <AnimatedCircle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_IN}
          stroke={COLOR_PROTEIN} strokeWidth={W_IN} fill="none"
          strokeDasharray={CIRC_IN} strokeLinecap="round"
          animatedProps={propsIn}
        />
        <AnimatedCircle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R_H2O}
          stroke={COLOR_WATER} strokeWidth={W_H2O} fill="none"
          strokeDasharray={CIRC_H2O} strokeLinecap="round"
          animatedProps={propsH2o}
        />
      </Svg>
      {/* Ringmitte: "Noch X kcal" */}
      <View style={ringStyles.center}>
        <Text style={ringStyles.noch}>noch</Text>
        <Text style={ringStyles.pct}>{displayRemaining}</Text>
        <Text style={ringStyles.sub}>kcal</Text>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  noch: {
    color: "#888",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  pct: {
    fontSize: 22,
    fontWeight: "800",
    color: COLOR_CAL_RING,
    lineHeight: 24,
  },
  sub: {
    color: "#888",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
});

// ─────────────────────────────────────────
// Screen
// ─────────────────────────────────────────

export default function HomeScreen() {
  // ── Calorie goal (TDEE + training burn + luteal bonus) via shared hook ────────
  const { healthBurnKcal, healthSteps, healthProtein, refreshHealth } = useHealthData();
  const { currentGoal, bonusActive } = useCalorieGoal(healthBurnKcal);
  const { stepGoal } = useStepGoal();
  const water = useWaterIntake();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [proteinGoal, setProteinGoal] = useState(0);
  const [todayKcal, setTodayKcal] = useState(0);
  const [todayProtein, setTodayProtein] = useState(0);
  const [burnedKcal, setBurnedKcal] = useState(0);
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [scheduledPlan, setScheduledPlan] = useState<Plan | null>(null);
  const [lastPlan, setLastPlan] = useState<Plan | null>(null);
  const [trainedToday, setTrainedToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [hmStatus, setHmStatus] = useState(HealthManager.getStatus());
  // Mirrors HealthManager._isNativeReady — prevents any HC call during the
  // Android startup window before the permission launcher is registered.
  const [nativeReady, setNativeReady] = useState(HealthManager.isNativeReady());
  // 'loading' = kein Cache + kein Live-Fetch fertig
  // 'cache'   = zeigt lokale Daten, Live-Fetch läuft noch/fehlgeschlagen
  // 'live'    = frische Daten aus Supabase/Health
  const [dataSource, setDataSource] = useState<"loading" | "cache" | "live">(
    "loading",
  );
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);

  // Ref für aktuelle Health-Werte, damit fetchDashboardData (useCallback ohne
  // deps) trotzdem aktuelle Werte in den Cache schreiben kann.
  const latestHealthRef = useRef<{ steps: number; burnKcal: number }>({
    steps: 0,
    burnKcal: 0,
  });

  // Weight-chart tag overlay
  const [weightTagMap, setWeightTagMap] = useState<Map<string, WeightTagInfo>>(
    new Map(),
  );
  const [weightInsight, setWeightInsight] = useState<string | null>(null);

  // Food scanner
  const [scannerOpen, setScannerOpen] = useState(false);

  // Wasser: frei eingegebene Menge
  const [customWaterMl, setCustomWaterMl] = useState("");
  const [waterToast, setWaterToast] = useState<string | null>(null);

  async function handleAddWater(ml: number) {
    const ok = await water.addIntake(ml);
    setWaterToast(
      ok ? `+${ml} ml Wasser hinzugefügt` : "Wasser konnte nicht gespeichert werden",
    );
  }

  function addCustomWater() {
    const ml = parseInt(customWaterMl, 10);
    if (!Number.isFinite(ml) || ml <= 0) return;
    void handleAddWater(Math.min(ml, 3000));
    setCustomWaterMl("");
  }

  function handleFoodDetected(data: FoodAnalysis) {
    setTodayKcal((prev) => prev + data.calories);
    setTodayProtein((prev) => prev + data.protein);
  }

  // Löst bei Split-Plänen (plan_days) den heutigen Trainingstag auf und startet ihn.
  async function handleStartPlan(plan: Plan) {
    const dayIndex = resolveDayIndexForDate(plan.scheduled_days, new Date());
    const { data: day } = await supabase
      .from("plan_days")
      .select("id")
      .eq("plan_id", plan.id)
      .eq("day_index", dayIndex)
      .maybeSingle();

    router.push({
      pathname: "/active-workout",
      params: {
        planId: plan.id,
        planName: plan.title,
        ...(day ? { dayId: day.id } : {}),
      },
    });
  }

  // Health-Ref aktuell halten, damit fetchDashboardData (leere deps) beim
  // Speichern des Caches immer die neuesten Health-Werte sieht.
  useEffect(() => {
    latestHealthRef.current = { steps: healthSteps, burnKcal: healthBurnKcal };
  }, [healthSteps, healthBurnKcal]);

  // Startup guard: init() läuft einmalig beim Mount.
  // syncHealthToSupabase() und alle nativen HC-Calls werden erst ausgeführt,
  // wenn _isNativeReady true ist (nach initialize() + 500 ms Anlaufzeit).
  // Solange nativeReady false ist, bleiben Sync-Button und Pull-to-Refresh
  // für HC-Operationen gesperrt — kein Kotlin-Crash durch uninitialized launcher.
  useEffect(() => {
    setHmStatus("pending");
    setNativeReady(false);
    HealthManager.init().then(ready => {
      setHmStatus(HealthManager.getStatus());
      setNativeReady(HealthManager.isNativeReady());
      if (ready) syncHealthToSupabase();
    });
  }, []);

  // Kcal ticker
  const [displayKcal, setDisplayKcal] = useState(0);
  const kcalRaf = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    if (loading || todayKcal === 0) {
      setDisplayKcal(0);
      return;
    }
    const duration = 900;
    const start = Date.now();
    const target = todayKcal;
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayKcal(Math.round(target * eased));
      if (t < 1) kcalRaf.current = requestAnimationFrame(tick);
    };
    kcalRaf.current = requestAnimationFrame(tick);
    return () => {
      if (kcalRaf.current) cancelAnimationFrame(kcalRaf.current);
    };
  }, [todayKcal, loading]);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  // Counter-based cancellation: incrementing before a new fetch invalidates
  // any in-flight promise from a previous call.
  const fetchCountRef = useRef(0);

  const fetchDashboardData = useCallback(async (): Promise<boolean> => {
    const fetchId = ++fetchCountRef.current;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || fetchCountRef.current !== fetchId) return false;

      const today = todayISO();
      const tomorrow = tomorrowISO();
      const todayDay = new Date().getDay();

      const [
        profileRes,
        foodRes,
        weightRes,
        scheduledRes,
        lastPlanRes,
        trainRes,
        burnedRes,
        dailyLogsRes,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, weight_kg, protein_per_kg")
          .eq("id", user.id)
          .single(),
        supabase
          .from("food_logs")
          .select("calories, protein")
          .eq("user_id", user.id)
          .gte("created_at", today)
          .lt("created_at", tomorrow),
        supabase
          .from("body_measurements")
          .select("value, measured_at")
          .eq("user_id", user.id)
          .eq("region", "Gewicht")
          .order("measured_at", { ascending: true })
          .limit(14),
        supabase
          .from("workout_plans")
          .select("id, title, scheduled_days")
          .eq("user_id", user.id)
          .contains("scheduled_days", [todayDay])
          .limit(1),
        supabase
          .from("workout_plans")
          .select("id, title, scheduled_days")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("exercise_logs")
          .select("id")
          .eq("user_id", user.id)
          .gte("created_at", today)
          .lt("created_at", tomorrow)
          .limit(1),
        supabase
          .from("exercise_logs")
          .select("calories_burned")
          .eq("user_id", user.id)
          .gte("created_at", today)
          .lt("created_at", tomorrow),
        // Daily logs for last 60 days — for weight chart tag overlay + luteal detection
        supabase
          .from("daily_logs")
          .select("date, tags")
          .eq("user_id", user.id)
          .gte("date", sixtyDaysAgoISO())
          .lte("date", today),
      ]);

      if (fetchCountRef.current !== fetchId) return false;

      let prof: Profile | null = null;
      if (profileRes.data) {
        prof = profileRes.data as Profile;
        setProfile(prof);
      }

      const kcal =
        foodRes.data?.reduce((s, l) => s + (l.calories ?? 0), 0) ?? 0;
      const prot =
        foodRes.data?.reduce((s, l) => s + (l.protein ?? 0), 0) ?? 0;
      const burned =
        burnedRes.data?.reduce((s, l) => s + (l.calories_burned ?? 0), 0) ?? 0;
      const pg = prof ? calcProteinGoal(prof) : 0;

      setTodayKcal(kcal);
      setTodayProtein(prot);
      setBurnedKcal(burned);
      setScheduledPlan(scheduledRes.data?.[0] ?? null);
      setLastPlan(lastPlanRes.data?.[0] ?? null);
      setTrainedToday((trainRes.data?.length ?? 0) > 0);
      if (prof) setProteinGoal(pg);

      const logRows: DailyLogRow[] = (dailyLogsRes.data ?? []) as DailyLogRow[];
      const entries: WeightEntry[] = weightRes.data ?? [];
      setWeightData(entries);

      const tMap = new Map<string, WeightTagInfo>();
      for (const row of logRows) {
        const t = row.tags ?? [];
        tMap.set(row.date, {
          period: t.includes(TAG_ID_PERIOD),
          alcohol: t.includes(TAG_ID_ALCOHOL),
        });
      }
      setWeightTagMap(tMap);
      setWeightInsight(computeWeightInsight(entries, tMap));

      // Erfolgreichen Fetch in den lokalen Cache schreiben
      void saveCache({
        todayKcal: kcal,
        todayProtein: prot,
        burnedKcal: burned,
        proteinGoal: pg,
        healthSteps: latestHealthRef.current.steps,
        healthBurnKcal: latestHealthRef.current.burnKcal,
      });

      return true;
    } catch (error) {
      console.warn("[Dashboard] Laden fehlgeschlagen (offline?):", error);
      return false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function run() {
        // ── Schritt 1: Cache sofort laden und anzeigen ──────────────────────
        const cache = await loadCache();
        if (cancelled) return;

        if (cache) {
          // Cache vorhanden → UI sofort befüllen, kein Ladebalken nötig
          setTodayKcal(cache.todayKcal);
          setTodayProtein(cache.todayProtein);
          setBurnedKcal(cache.burnedKcal);
          setProteinGoal(cache.proteinGoal);
          setDataSource("cache");
          setCacheTimestamp(cache.cachedAt);
          setLoading(false);
        } else {
          // Kein Cache → Ladebalken zeigen bis Live-Daten ankommen
          setLoading(true);
        }

        // ── Schritt 2: Live-Daten im Hintergrund laden ──────────────────────
        const success = await fetchDashboardData();
        if (cancelled) return;

        setLoading(false);
        if (success) {
          setDataSource("live");
          setCacheTimestamp(null);
        }
        // Bei Fehler: dataSource bleibt 'cache' (oder 'loading' ohne Cache)
      }

      run();

      return () => {
        cancelled = true;
        fetchCountRef.current++; // laufenden Fetch ungültig machen
      };
    }, [fetchDashboardData]),
  );

  const handleManualSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Guard: HC-Sync nur wenn nativer Launcher bereit ist.
      // nativeReady spiegelt HealthManager._isNativeReady wider und ist erst
      // true nachdem initialize() + 500 ms Wartezeit abgeschlossen sind.
      const [success] = await Promise.all([
        fetchDashboardData(),
        nativeReady
          ? syncHealthToSupabase().then(() => refreshHealth())
          : (__DEV__
              ? Promise.resolve(void console.log("[HomeScreen] health sync skipped — native not ready"))
              : Promise.resolve()),
      ]);
      setLastSynced(new Date());
      if (success) {
        setDataSource("live");
        setCacheTimestamp(null);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [fetchDashboardData, refreshHealth, nativeReady]);

  async function handleLogout() {
    await clearCredentials();
    await supabase.auth.signOut();
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const { calorieRatio, proteinRatio, remaining } = useMemo(
    () => ({
      calorieRatio: currentGoal > 0 ? todayKcal / currentGoal : 0,
      // In DEV mock mode healthProtein changes on every sync, making the
      // protein ring animate visibly. In production healthProtein is 0 and
      // todayProtein (from food_logs) is used instead.
      proteinRatio:
        proteinGoal > 0
          ? (__DEV__ && healthProtein > 0 ? healthProtein : todayProtein) /
            proteinGoal
          : 0,
      remaining: currentGoal - displayKcal,
    }),
    [currentGoal, todayKcal, proteinGoal, todayProtein, healthProtein, displayKcal],
  );

  const { chartData, latestWeight, hasTaggedPoints, chartStrips } = useMemo(
    () => ({
      chartData: toChartData(weightData, weightTagMap),
      latestWeight:
        weightData.length > 0 ? weightData[weightData.length - 1].value : null,
      hasTaggedPoints: weightData.some((e) => {
        const info = weightTagMap.get(e.measured_at.slice(0, 10));
        return info?.period || info?.alcohol;
      }),
      chartStrips: buildChartStrips(weightData, weightTagMap),
    }),
    [weightData, weightTagMap],
  );

  const {
    displayPlan,
    isPlanScheduledToday,
    planDays,
    isTodayTrainingDay,
    nextDayName,
  } = useMemo(() => {
    const plan = scheduledPlan ?? lastPlan;
    const dayNum = new Date().getDay();
    const days = plan?.scheduled_days ?? null;
    const isToday = days ? days.includes(dayNum) : false;
    return {
      displayPlan: plan,
      isPlanScheduledToday: !!scheduledPlan,
      planDays: days,
      isTodayTrainingDay: isToday,
      nextDayName: !isToday ? nextScheduledDayName(days) : null,
    };
  }, [scheduledPlan, lastPlan]);

  // Tooltip renderer (closure over weightTagMap)
  const renderTooltip = (items: any[]) => {
    const item = items[0];
    if (!item) return null;
    const info = weightTagMap.get(item.date as string);
    const tags: string[] = [];
    if (info?.period) tags.push("🩸 Periode");
    if (info?.alcohol) tags.push("🍷 Alkohol");
    return (
      <View style={styles.tooltip}>
        <Text style={styles.tooltipWeight}>{item.value} kg</Text>
        {tags.length > 0 && (
          <Text style={styles.tooltipTags}>{tags.join(" · ")}</Text>
        )}
        {item.date && (
          <Text style={styles.tooltipDate}>
            {isoToLabel(item.date as string)}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <FoodScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleFoodDetected}
        dailyKcalGoal={currentGoal > 0 ? currentGoal : undefined}
        proteinGoal={proteinGoal > 0 ? proteinGoal : undefined}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={handleManualSync}
            tintColor="#00E5FF"
            colors={["#00E5FF"]}
          />
        }
      >
        {/* ══ HEADER ══ */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {profile?.display_name
                ? `Hallo, ${profile.display_name}!`
                : "Hallo!"}
            </Text>
            <Text style={styles.appName}>AvoraSport</Text>
            {lastSynced && (
              <Text style={styles.syncText}>
                Zuletzt aktualisiert: Gerade eben
              </Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {/* DEV-only: tap to fire a new mock sync and watch all rings animate */}
            {__DEV__ && (
              <TouchableOpacity
                style={[styles.iconBtn, styles.devSyncBtn]}
                onPress={handleManualSync}
                disabled={isSyncing || !nativeReady}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name={isSyncing ? "hourglass-top" : "refresh"}
                  size={18}
                  color="#FF9100"
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleLogout}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="logout" size={20} color="#888" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Offline-Indikator ── */}
        {dataSource === "cache" && !loading && (
          <View style={styles.offlineBanner}>
            <MaterialIcons name="cloud-off" size={12} color="#FF9100" />
            <Text style={styles.offlineBannerText}>
              {cacheTimestamp && isStale(cacheTimestamp)
                ? `Offline · Cache vom ${new Date(cacheTimestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
                : "Offline · Zeige lokale Daten"}
            </Text>
          </View>
        )}

        {!loading && (
          <>
            {/* ── Ernährungs-Widget ── */}
            {currentGoal > 0 && (
              <Animated.View
                entering={FadeInDown.delay(0).duration(600).springify()}
                style={styles.card}
              >
                <Text style={styles.cardLabel}>ERNÄHRUNG · HEUTE</Text>
                <View style={styles.nutritionRow}>
                  {/* Ring + Legende als vertikale Einheit */}
                  <View style={styles.ringWithLegend}>
                    <GoalRings
                      calorieProgress={calorieRatio}
                      stepsProgress={healthSteps / stepGoal}
                      proteinProgress={proteinRatio}
                      waterProgress={water.goalMl > 0 ? water.consumedMl / water.goalMl : 0}
                      remaining={remaining}
                    />
                    <View style={styles.ringLegend}>
                      <View style={styles.ringLegendItem}>
                        <View style={[styles.ringLegendDot, { backgroundColor: COLOR_CAL_RING }]} />
                        <Text style={styles.ringLegendText}>Kcal</Text>
                      </View>
                      <View style={styles.ringLegendItem}>
                        <View style={[styles.ringLegendDot, { backgroundColor: COLOR_STEPS }]} />
                        <Text style={styles.ringLegendText}>Schritte</Text>
                      </View>
                      <View style={styles.ringLegendItem}>
                        <View style={[styles.ringLegendDot, { backgroundColor: COLOR_PROTEIN }]} />
                        <Text style={styles.ringLegendText}>Protein</Text>
                      </View>
                      <View style={styles.ringLegendItem}>
                        <View style={[styles.ringLegendDot, { backgroundColor: COLOR_WATER }]} />
                        <Text style={styles.ringLegendText}>Wasser</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.nutritionInfo}>
                    <Text style={styles.kcalValue}>{displayKcal}</Text>
                    <Text style={styles.kcalUnit}>von {currentGoal} kcal</Text>
                    {bonusActive && (
                      <Text style={styles.lutealBonusText}>
                        Inkl. Zyklus-Bonus 🩸
                      </Text>
                    )}
                    <View style={styles.kcalDivider} />
                    <Text
                      style={[
                        styles.kcalRemaining,
                        {
                          color:
                            remaining < 0
                              ? "#f44336"
                              : remaining < currentGoal * 0.15
                                ? "#ff9800"
                                : COLOR_CAL_RING,
                        },
                      ]}
                    >
                      {remaining < 0 ? "+" : ""}
                      {Math.abs(remaining)}
                    </Text>
                    <Text style={styles.kcalUnit}>
                      {remaining < 0 ? "kcal überschritten" : "kcal verfügbar"}
                    </Text>
                    <View style={styles.legendRow}>
                      {burnedKcal > 0 && (
                        <View style={styles.legendChip}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: COLOR_STEPS },
                            ]}
                          />
                          <Text style={styles.legendText}>
                            {burnedKcal} kcal
                          </Text>
                        </View>
                      )}
                      {healthBurnKcal > 0 && (
                        <View style={styles.legendChip}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: "#4CAF50" },
                            ]}
                          />
                          <Text style={styles.legendText}>
                            {healthBurnKcal} kcal ❤️
                          </Text>
                        </View>
                      )}
                      {proteinGoal > 0 && (
                        <View style={styles.legendChip}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: COLOR_PROTEIN },
                            ]}
                          />
                          <Text style={styles.legendText}>
                            {Math.round(todayProtein)}/{proteinGoal}g P
                          </Text>
                        </View>
                      )}
                      {water.goalMl > 0 && (
                        <View style={styles.legendChip}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: COLOR_WATER },
                            ]}
                          />
                          <Text style={styles.legendText}>
                            {(water.consumedMl / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}/{(water.goalMl / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} l
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.cardLink}
                  onPress={() => router.push("/(app)/(tabs)/nutrition")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cardLinkText}>Mahlzeit erfassen</Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={15}
                    color={COLOR_CALORIES}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Aktivitäts-Karte ── */}
            {healthSteps > 0 && (
              <Animated.View
                entering={FadeInDown.delay(60).duration(500).springify()}
                style={styles.card}
              >
                <Text style={styles.cardLabel}>AKTIVITÄT · HEUTE</Text>

                {/* Schrittzahl + Prozent-Badge */}
                <View style={styles.activityHeader}>
                  <View>
                    <Text style={styles.activitySteps}>
                      {healthSteps.toLocaleString("de-DE")}
                    </Text>
                    <Text style={styles.activitySubtitle}>
                      von {stepGoal.toLocaleString("de-DE")} Schritten
                    </Text>
                  </View>
                  <View style={styles.activityBadge}>
                    <Text style={styles.activityBadgeText}>
                      {Math.min(Math.round((healthSteps / stepGoal) * 100), 100)} %
                    </Text>
                  </View>
                </View>

                {/* Fortschrittsbalken */}
                <View style={styles.activityBarTrack}>
                  <View
                    style={[
                      styles.activityBarFill,
                      { width: `${Math.min((healthSteps / stepGoal) * 100, 100)}%` },
                    ]}
                  />
                </View>

                {/* Platzhalter für spätere Fitnessdaten */}
                <View style={styles.activityExtras}>
                  {healthBurnKcal > 0 && (
                    <View style={styles.activityExtraItem}>
                      <MaterialIcons name="local-fire-department" size={14} color={COLOR_STEPS} />
                      <Text style={styles.activityExtraLabel}>Kalorien</Text>
                      <Text style={[styles.activityExtraValue, { color: COLOR_STEPS }]}>
                        {healthBurnKcal} kcal
                      </Text>
                    </View>
                  )}
                  <View style={styles.activityExtraItem}>
                    <MaterialIcons name="favorite-border" size={14} color="#333" />
                    <Text style={styles.activityExtraLabel}>Puls</Text>
                    <Text style={styles.activityExtraValue}>— bpm</Text>
                  </View>
                  <View style={styles.activityExtraItem}>
                    <MaterialIcons name="timer" size={14} color="#333" />
                    <Text style={styles.activityExtraLabel}>Akt. Min.</Text>
                    <Text style={styles.activityExtraValue}>—</Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* ── Gewichtsverlauf ── */}
            {chartData.length >= 2 && (
              <Animated.View
                entering={FadeInDown.delay(120).duration(600).springify()}
                style={styles.card}
              >
                <View style={styles.cardLabelRow}>
                  <Text style={styles.cardLabel}>GEWICHTSVERLAUF</Text>
                  {latestWeight !== null && (
                    <View style={styles.weightBadge}>
                      <Text style={styles.weightBadgeText}>
                        {latestWeight} kg
                      </Text>
                    </View>
                  )}
                </View>

                {/* Chart with background strips overlay */}
                <View style={{ position: "relative" }}>
                  {/* Coloured background strips for tagged days */}
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { left: YAXIS_W, height: CHART_H },
                    ]}
                    pointerEvents="none"
                  >
                    {chartStrips.map((s, idx) => (
                      <View
                        key={idx}
                        style={{
                          position: "absolute",
                          left: s.left,
                          width: s.width,
                          top: 0,
                          height: CHART_H,
                          backgroundColor: s.color,
                          borderRadius: 4,
                        }}
                      />
                    ))}
                  </View>

                  <LineChart
                    data={chartData}
                    areaChart
                    width={CHART_W}
                    height={CHART_H}
                    color={COLOR_CALORIES}
                    thickness={2.5}
                    curved
                    startFillColor="rgba(0,229,255,0.30)"
                    endFillColor="rgba(0,229,255,0.0)"
                    startOpacity={1}
                    endOpacity={0}
                    hideRules
                    yAxisThickness={0}
                    xAxisThickness={1}
                    xAxisColor="#2a2a2a"
                    yAxisTextStyle={{ color: "#555", fontSize: 9 }}
                    xAxisLabelTextStyle={{ color: "#666", fontSize: 9 }}
                    initialSpacing={12}
                    endSpacing={12}
                    noOfSections={3}
                    backgroundColor="transparent"
                    isAnimated
                    animationDuration={900}
                    pointerConfig={{
                      pointerStripHeight: CHART_H,
                      pointerStripColor: "#333",
                      pointerStripWidth: 1,
                      pointerColor: COLOR_CALORIES,
                      radius: 5,
                      pointerLabelWidth: 160,
                      pointerLabelHeight: 58,
                      autoAdjustPointerLabelPosition: true,
                      pointerLabelComponent: renderTooltip,
                    }}
                  />
                </View>

                {/* Tag legend — only shown when relevant points exist */}
                {hasTaggedPoints && (
                  <View style={styles.chartLegend}>
                    <View style={styles.legendChip}>
                      <View
                        style={[
                          styles.legendDot,
                          {
                            backgroundColor: "#FF5252",
                            width: 9,
                            height: 9,
                            borderRadius: 5,
                          },
                        ]}
                      />
                      <Text style={styles.legendText}>Periode</Text>
                    </View>
                    <View style={styles.legendChip}>
                      <View
                        style={[
                          styles.legendDot,
                          {
                            backgroundColor: "#FFD600",
                            width: 9,
                            height: 9,
                            borderRadius: 5,
                          },
                        ]}
                      />
                      <Text style={styles.legendText}>Alkohol</Text>
                    </View>
                  </View>
                )}

                {/* Insight text */}
                {weightInsight && (
                  <View style={styles.insightBox}>
                    <Text style={styles.insightText}>{weightInsight}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.cardLink}
                  onPress={() => router.push("/body-stats")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cardLinkText}>Körperwerte erfassen</Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={15}
                    color={COLOR_CALORIES}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Training ── */}
            <Animated.View
              entering={FadeInDown.delay(240).duration(600).springify()}
            >
              <Text style={styles.sectionTitle}>Training</Text>

              {trainedToday && (
                <View style={[styles.card, styles.cardGreen]}>
                  <View style={styles.row}>
                    <MaterialIcons
                      name="check-circle"
                      size={18}
                      color="#4caf50"
                    />
                    <Text style={styles.successText}>
                      Heute schon aktiv — stark!
                    </Text>
                  </View>
                </View>
              )}

              {displayPlan && (
                <View style={[styles.card, { marginBottom: 12 }]}>
                  <View style={styles.planCardHeader}>
                    <Text style={styles.cardLabel}>
                      {isPlanScheduledToday
                        ? "PLAN FÜR HEUTE"
                        : trainedToday
                          ? "LETZTER PLAN"
                          : "BEREIT FÜR HEUTE"}
                    </Text>
                    {planDays && planDays.length > 0 && (
                      <View
                        style={[
                          styles.trainingBadge,
                          isTodayTrainingDay && styles.trainingBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.trainingBadgeText,
                            isTodayTrainingDay &&
                              styles.trainingBadgeTextActive,
                          ]}
                        >
                          {isTodayTrainingDay
                            ? "Heute steht dein Training an! 🔥"
                            : nextDayName
                              ? `Nächstes Training: ${nextDayName}`
                              : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.planRow}>
                    <View style={styles.planIcon}>
                      <MaterialIcons
                        name="fitness-center"
                        size={18}
                        color={COLOR_CALORIES}
                      />
                    </View>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {displayPlan.title}
                    </Text>
                    <TouchableOpacity
                      style={styles.planStartBtn}
                      onPress={() => handleStartPlan(displayPlan)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="play-arrow" size={17} color="#fff" />
                      <Text style={styles.planStartText}>Starten</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionPrimary]}
                  onPress={() => router.push("/active-workout")}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="fitness-center" size={18} color="#fff" />
                  <Text style={styles.actionText}>Freies Training</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionSecondary]}
                  onPress={() => router.push("/workout-plans")}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name="list-alt"
                    size={18}
                    color={COLOR_CALORIES}
                  />
                  <Text style={[styles.actionText, { color: COLOR_CALORIES }]}>
                    Mit Plan
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* ── Wasser ── */}
            <Animated.View
              entering={FadeInDown.delay(280).duration(600).springify()}
            >
              <Text style={styles.sectionTitle}>Wasser</Text>

              <View style={styles.card}>
                <View style={styles.waterHeaderRow}>
                  {water.remainingMl > 0 ? (
                    <Text style={styles.waterRemainingText}>
                      {water.consumedMl} ml getrunken · noch {water.remainingMl} ml
                    </Text>
                  ) : (
                    <View style={styles.row}>
                      <MaterialIcons name="check-circle" size={15} color="#4caf50" />
                      <Text style={styles.successText}>Tagesziel erreicht!</Text>
                    </View>
                  )}
                  {water.hasIntakeToday && (
                    <TouchableOpacity onPress={() => water.removeLastIntake()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.waterUndoText}>Rückgängig</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.waterChipRow}>
                  {[150, 250, 500].map((ml) => (
                    <TouchableOpacity
                      key={ml}
                      style={styles.waterChip}
                      onPress={() => handleAddWater(ml)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.waterChipText}>+{ml} ml</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.waterCustomRow}>
                  <TextInput
                    style={styles.waterCustomInput}
                    value={customWaterMl}
                    onChangeText={(v) => setCustomWaterMl(v.replace(/[^0-9]/g, "").slice(0, 4))}
                    placeholder="Andere Menge (ml)"
                    placeholderTextColor="#557"
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={addCustomWater}
                  />
                  <TouchableOpacity
                    style={[styles.waterCustomBtn, !customWaterMl && styles.waterCustomBtnDisabled]}
                    onPress={addCustomWater}
                    disabled={!customWaterMl}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.waterCustomBtnText}>Hinzufügen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* FAB — KI-Kamera */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setScannerOpen(true)}
        activeOpacity={0.85}
      >
        <MaterialIcons name="camera-alt" size={24} color="#121212" />
      </TouchableOpacity>

      {waterToast && (
        <Toast
          message={waterToast}
          type={waterToast.startsWith("+") ? "success" : "error"}
          duration={1800}
          onDismiss={() => setWaterToast(null)}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#121212" },
  container: { padding: 24, paddingTop: 56, paddingBottom: 56 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  devSyncBtn: { borderColor: "#FF910055" },
  greeting: { fontSize: 22, fontWeight: "800", color: "#fff" },
  appName: {
    fontSize: 12,
    color: COLOR_CALORIES,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  syncText: {
    fontSize: 10,
    color: "#777",
    marginTop: 3,
  },
  card: {
    backgroundColor: "#1e1e1e",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  cardGreen: {
    borderColor: "#1a3a28",
    backgroundColor: "#0d1f14",
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: {
    color: "#BBBBBB",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  cardLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
    paddingTop: 12,
    marginTop: 8,
    gap: 2,
  },
  cardLinkText: { color: COLOR_CALORIES, fontSize: 12, fontWeight: "600" },

  nutritionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 12,
  },
  nutritionInfo: { flex: 1 },
  kcalValue: { color: "#fff", fontSize: 30, fontWeight: "800", lineHeight: 34 },
  kcalUnit: { color: "#999", fontSize: 11, marginBottom: 2 },
  lutealBonusText: {
    color: "#FF9100",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  kcalDivider: { height: 1, backgroundColor: "#2a2a2a", marginVertical: 10 },
  kcalRemaining: { fontSize: 22, fontWeight: "800", lineHeight: 26 },

  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  legendChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: "#999", fontSize: 10, fontWeight: "600" },

  weightBadge: {
    backgroundColor: "#0a1a1e",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLOR_CALORIES,
  },
  weightBadgeText: { color: COLOR_CALORIES, fontSize: 12, fontWeight: "700" },

  // Chart extras
  chartLegend: { flexDirection: "row", gap: 14, marginTop: 8 },
  insightBox: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    padding: 12,
    marginTop: 10,
  },
  insightText: { color: "#aaa", fontSize: 12, lineHeight: 18 },

  // Pointer tooltip
  tooltip: {
    backgroundColor: "#1e1e1e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 10,
    gap: 2,
  },
  tooltipWeight: { color: "#fff", fontSize: 14, fontWeight: "800" },
  tooltipTags: { color: "#aaa", fontSize: 11, fontWeight: "600" },
  tooltipDate: { color: "#888", fontSize: 10 },

  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
    marginTop: 28,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  successText: { color: "#4caf50", fontSize: 13, fontWeight: "600" },

  waterHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  waterUndoText: { color: "#888", fontSize: 12, fontWeight: "600" },
  waterRemainingText: { color: "#ccc", fontSize: 13, fontWeight: "600" },
  waterChipRow: { flexDirection: "row", gap: 10 },
  waterChip: {
    flex: 1, backgroundColor: "#0d2733", borderRadius: 10, borderWidth: 1, borderColor: "#154a5f",
    paddingVertical: 10, alignItems: "center",
  },
  waterChipText: { color: "#29B6F6", fontSize: 13, fontWeight: "700" },
  waterCustomRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  waterCustomInput: {
    flex: 1, backgroundColor: "#161616", borderRadius: 10, borderWidth: 1, borderColor: "#2a2a2a",
    paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 13,
  },
  waterCustomBtn: {
    backgroundColor: "#0d2733", borderRadius: 10, borderWidth: 1, borderColor: "#154a5f",
    paddingHorizontal: 16, alignItems: "center", justifyContent: "center",
  },
  waterCustomBtnDisabled: { opacity: 0.4 },
  waterCustomBtnText: { color: "#29B6F6", fontSize: 13, fontWeight: "700" },

  planRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#0a1a1e",
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
  planStartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLOR_CALORIES,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  planStartText: { color: "#121212", fontSize: 13, fontWeight: "700" },

  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
  },
  planCardHeader: { marginBottom: 12 },
  trainingBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#333",
  },
  trainingBadgeActive: { backgroundColor: "#0d2a14", borderColor: "#4caf50" },
  trainingBadgeText: { color: "#888", fontSize: 11, fontWeight: "600" },
  trainingBadgeTextActive: { color: "#4caf50" },

  fab: {
    position: "absolute",
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLOR_CALORIES,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: COLOR_CALORIES,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },

  actionPrimary: { backgroundColor: COLOR_CALORIES },
  actionSecondary: {
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: COLOR_CALORIES,
  },
  actionText: { color: "#121212", fontSize: 14, fontWeight: "700" },

  // ── Offline-Indikator ────────────────────────────────────────────────────────
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1a1200",
    borderWidth: 1,
    borderColor: "#3a2800",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  offlineBannerText: {
    color: "#FF9100",
    fontSize: 11,
    fontWeight: "600",
  },

  // ── Ring-Legende ─────────────────────────────────────────────────────────────
  ringWithLegend: {
    alignItems: "center",
  },
  ringLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 10,
    rowGap: 5,
    marginTop: 10,
    maxWidth: RING_SIZE,
  },
  ringLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ringLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  ringLegendText: {
    color: "#888",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Aktivitäts-Karte ─────────────────────────────────────────────────────────
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 6,
  },
  activitySteps: {
    fontSize: 34,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 38,
  },
  activitySubtitle: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  activityBadge: {
    backgroundColor: "#1a1a08",
    borderWidth: 1,
    borderColor: COLOR_STEPS,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activityBadgeText: {
    color: COLOR_STEPS,
    fontSize: 12,
    fontWeight: "700",
  },
  activityBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2a2a2a",
    marginTop: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  activityBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR_STEPS,
  },
  activityExtras: {
    flexDirection: "row",
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
    paddingTop: 12,
  },
  activityExtraItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  activityExtraLabel: {
    fontSize: 9,
    color: "#888",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  activityExtraValue: {
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
  },
});
