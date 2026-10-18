import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { supabase } from '@/services/supabaseClient';
import { t } from '@/lib/i18n';

// ── Types (exported for testing) ──────────────────────────────────────────────

/** User-chosen direction of the calorie goal (profiles.calorie_goal). */
export type CalorieGoalType = 'lose' | 'maintain' | 'gain';

export const CALORIE_GOAL_TYPES: CalorieGoalType[] = ['lose', 'maintain', 'gain'];

export const CALORIE_GOAL_LABELS: Record<CalorieGoalType, string> = {
  get lose()     { return t('domain.calorieGoal.lose'); },
  get maintain() { return t('domain.calorieGoal.maintain'); },
  get gain()     { return t('domain.calorieGoal.gain'); },
};

/** kcal applied on top of the TDEE: moderate deficit / lean-bulk surplus. */
export const CALORIE_GOAL_ADJUSTMENT: Record<CalorieGoalType, number> = {
  lose:     -500,
  maintain: 0,
  gain:     300,
};

export type ProfileData = {
  gender: 'male' | 'female' | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  manual_calorie_offset: number | null;
  calorie_goal?: CalorieGoalType | null;
  auto_adjust_calories: boolean | null;
  cycle_tracking_enabled: boolean | null;
  cycle_length_days: number | null;
  cycle_calorie_bonus: number | null;
};

export type DailyLogRow = { date: string; tags: string[] | null };

// ── Helpers ────────────────────────────────────────────────────────────────────

const TAG_PERIOD = 'period';

function todayISO()        { return new Date().toISOString().slice(0, 10); }
function tomorrowISO()     { return new Date(Date.now() + 86400000).toISOString().slice(0, 10); }
function sixtyDaysAgoISO() { return new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10); }

function ageFromDOB(dob: string | null): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

/** Fixed activity multiplier ("moderately active") applied to the BMR. */
export const ACTIVITY_FACTOR = 1.55;

/** Flat TDEE used when gender, age, height or weight is missing. */
export const FALLBACK_TDEE = 2500;

/**
 * Every intermediate value of the goal calculation, so the UI can show the
 * user exactly how their number comes about (CalorieBreakdownModal).
 */
export type CalorieBreakdown = {
  /** null when profile data is incomplete → FALLBACK_TDEE was used. */
  inputs: { gender: 'male' | 'female'; age: number; weightKg: number; heightCm: number } | null;
  /** Revised Harris-Benedict BMR, rounded (null in fallback mode). */
  bmr: number | null;
  activityFactor: number;
  /** BMR × activity factor, or FALLBACK_TDEE. */
  tdee: number;
  goalType: CalorieGoalType;
  goalAdjustment: number;
  manualOffset: number;
  /** Workout burn logged today (exercise_logs), counted or not. */
  workoutKcal: number;
  /** Whether workoutKcal is added (profiles.auto_adjust_calories). */
  workoutCounted: boolean;
  /** Active energy from Apple Health / Health Connect. */
  healthKcal: number;
  cycleBonus: number;
  total: number;
};

function calcBaseTDEE(p: ProfileData): Pick<CalorieBreakdown, 'inputs' | 'bmr' | 'tdee'> {
  const age = ageFromDOB(p.date_of_birth);
  if (!p.weight_kg || !p.height_cm || !age || !p.gender) {
    return { inputs: null, bmr: null, tdee: FALLBACK_TDEE };
  }
  const bmr =
    p.gender === 'male'
      ? 88.362 + 13.397 * p.weight_kg + 4.799 * p.height_cm - 5.677 * age
      : 447.593 + 9.247 * p.weight_kg + 3.098 * p.height_cm - 4.33 * age;
  // Multiply the *rounded* BMR so the numbers shown in the breakdown can be
  // recomputed by hand without a ±1 kcal discrepancy.
  const bmrRounded = Math.round(bmr);
  return {
    inputs: { gender: p.gender, age, weightKg: p.weight_kg, heightCm: p.height_cm },
    bmr: bmrRounded,
    tdee: Math.round(bmrRounded * ACTIVITY_FACTOR),
  };
}

function isInLutealPhase(logs: DailyLogRow[], p: ProfileData): boolean {
  if (!p.cycle_tracking_enabled) return false;
  const cycleLen = p.cycle_length_days ?? 28;

  const periodDates = logs
    .filter(l => (l.tags ?? []).includes(TAG_PERIOD))
    .map(l => l.date)
    .sort()
    .reverse();

  if (periodDates.length === 0) return false;

  const lastPeriod  = new Date(periodDates[0]);
  const nextPeriod  = new Date(lastPeriod);
  nextPeriod.setDate(nextPeriod.getDate() + cycleLen);

  const lutealStart = new Date(nextPeriod);
  lutealStart.setDate(lutealStart.getDate() - 14);

  const today = new Date(todayISO());
  return today >= lutealStart && today < nextPeriod;
}

// ── Public return type ─────────────────────────────────────────────────────────

export type CalorieGoalResult = {
  /** Final kcal goal: TDEE + training burn (if auto-adjust) + luteal bonus */
  currentGoal: number;
  /** True when today falls inside the 14-day luteal window */
  isLuteal: boolean;
  /** True when cycle tracking is on, bonus > 0, and isLuteal */
  bonusActive: boolean;
  /** Absolute kcal added by the luteal bonus (0 when inactive) */
  cycleBonus: number;
  /** Step-by-step derivation of currentGoal (null until the profile loaded) */
  breakdown: CalorieBreakdown | null;
  loading: boolean;
};

// ── Pure computation (exported for unit tests) ─────────────────────────────────

/**
 * Deterministic goal calculation: takes raw data and returns the result.
 * No React, no side-effects — safe to call from tests or server-side code.
 */
export function computeCalorieGoal(
  profile: ProfileData,
  dailyLogs: DailyLogRow[],
  burnedKcal: number,
  healthKcal = 0,
): Omit<CalorieGoalResult, 'loading' | 'breakdown'> & { breakdown: CalorieBreakdown } {
  const { inputs, bmr, tdee } = calcBaseTDEE(profile);
  const goalType       = profile.calorie_goal ?? 'maintain';
  const goalAdjustment = CALORIE_GOAL_ADJUSTMENT[goalType];
  const manualOffset   = profile.manual_calorie_offset ?? 0;
  // Manual workout burn only counts when the user opts in.
  // Health-tracker burn (healthKcal) is always additive when sync is active.
  const workoutCounted = !!profile.auto_adjust_calories && burnedKcal > 0;
  const manualBurn     = workoutCounted ? burnedKcal : 0;

  const isLuteal    = isInLutealPhase(dailyLogs, profile);
  const bonusKcal   = profile.cycle_calorie_bonus ?? 0;
  const bonusActive = !!profile.cycle_tracking_enabled && bonusKcal > 0 && isLuteal;
  const cycleBonus  = bonusActive ? bonusKcal : 0;

  const total = tdee + goalAdjustment + manualOffset + manualBurn + healthKcal + cycleBonus;

  return {
    currentGoal: total,
    isLuteal,
    bonusActive,
    cycleBonus,
    breakdown: {
      inputs, bmr, activityFactor: ACTIVITY_FACTOR, tdee,
      goalType, goalAdjustment, manualOffset,
      workoutKcal: Math.max(0, burnedKcal), workoutCounted,
      healthKcal, cycleBonus, total,
    },
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useCalorieGoal(healthKcal = 0): CalorieGoalResult {
  const [profile,    setProfile]    = useState<ProfileData | null>(null);
  const [dailyLogs,  setDailyLogs]  = useState<DailyLogRow[]>([]);
  const [burnedKcal, setBurnedKcal] = useState(0);
  const [loading,    setLoading]    = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;

        const today = todayISO();

        const [profileRes, logsRes, burnedRes, cycleRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('gender, date_of_birth, height_cm, weight_kg, manual_calorie_offset, calorie_goal, auto_adjust_calories, cycle_tracking_enabled, cycle_length_days, cycle_calorie_bonus')
            .eq('id', user.id)
            .single(),
          supabase
            .from('daily_logs')
            .select('date, tags')
            .eq('user_id', user.id)
            .gte('date', sixtyDaysAgoISO())
            .lte('date', today),
          supabase
            .from('exercise_logs')
            .select('calories_burned')
            .eq('user_id', user.id)
            .gte('created_at', today)
            .lt('created_at', tomorrowISO()),
          // Blutungstage (manuell + aus Apple Health / Health Connect)
          supabase
            .from('cycle_events')
            .select('date')
            .eq('user_id', user.id)
            .gte('date', sixtyDaysAgoISO())
            .lte('date', today),
        ]);

        if (!active) return;

        if (profileRes.data) setProfile(profileRes.data as ProfileData);
        // cycle_events als period-Tag einspeisen → computeCalorieGoal bleibt unverändert
        const cycleRows: DailyLogRow[] = (cycleRes.data ?? []).map((r) => ({ date: r.date, tags: [TAG_PERIOD] }));
        setDailyLogs([...((logsRes.data ?? []) as DailyLogRow[]), ...cycleRows]);
        setBurnedKcal(burnedRes.data?.reduce((s, l) => s + (l.calories_burned ?? 0), 0) ?? 0);
        setLoading(false);
      })();

      return () => { active = false; };
    }, [])
  );

  return useMemo((): CalorieGoalResult => {
    if (!profile) {
      return { currentGoal: 0, isLuteal: false, bonusActive: false, cycleBonus: 0, breakdown: null, loading };
    }
    return { ...computeCalorieGoal(profile, dailyLogs, burnedKcal, healthKcal), loading };
  }, [profile, dailyLogs, burnedKcal, healthKcal, loading]);
}
