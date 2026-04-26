import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { supabase } from '@/services/supabaseClient';

// ── Types (exported for testing) ──────────────────────────────────────────────

export type ProfileData = {
  gender: 'male' | 'female' | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  manual_calorie_offset: number | null;
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

function calcBaseTDEE(p: ProfileData): number {
  const age = ageFromDOB(p.date_of_birth);
  if (!p.weight_kg || !p.height_cm || !age || !p.gender) {
    return 2500 + (p.manual_calorie_offset ?? 0);
  }
  const bmr =
    p.gender === 'male'
      ? 88.362 + 13.397 * p.weight_kg + 4.799 * p.height_cm - 5.677 * age
      : 447.593 + 9.247 * p.weight_kg + 3.098 * p.height_cm - 4.33 * age;
  return Math.round(bmr * 1.55) + (p.manual_calorie_offset ?? 0);
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
): Omit<CalorieGoalResult, 'loading'> {
  const base       = calcBaseTDEE(profile);
  // Manual workout burn only counts when the user opts in.
  // Health-tracker burn (healthKcal) is always additive when sync is active.
  const manualBurn = profile.auto_adjust_calories && burnedKcal > 0 ? burnedKcal : 0;
  const withBurn   = base + manualBurn + healthKcal;

  const isLuteal    = isInLutealPhase(dailyLogs, profile);
  const bonusKcal   = profile.cycle_calorie_bonus ?? 0;
  const bonusActive = !!profile.cycle_tracking_enabled && bonusKcal > 0 && isLuteal;
  const cycleBonus  = bonusActive ? bonusKcal : 0;

  return {
    currentGoal: withBurn + cycleBonus,
    isLuteal,
    bonusActive,
    cycleBonus,
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

        const [profileRes, logsRes, burnedRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('gender, date_of_birth, height_cm, weight_kg, manual_calorie_offset, auto_adjust_calories, cycle_tracking_enabled, cycle_length_days, cycle_calorie_bonus')
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
        ]);

        if (!active) return;

        if (profileRes.data) setProfile(profileRes.data as ProfileData);
        setDailyLogs((logsRes.data ?? []) as DailyLogRow[]);
        setBurnedKcal(burnedRes.data?.reduce((s, l) => s + (l.calories_burned ?? 0), 0) ?? 0);
        setLoading(false);
      })();

      return () => { active = false; };
    }, [])
  );

  return useMemo((): CalorieGoalResult => {
    if (!profile) {
      return { currentGoal: 0, isLuteal: false, bonusActive: false, cycleBonus: 0, loading };
    }
    return { ...computeCalorieGoal(profile, dailyLogs, burnedKcal, healthKcal), loading };
  }, [profile, dailyLogs, burnedKcal, healthKcal, loading]);
}
