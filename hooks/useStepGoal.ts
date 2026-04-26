import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import {
  ActivityLevel,
  calculateDailyStepGoal,
  DEFAULT_ACTIVITY_LEVEL,
} from "@/lib/stepGoal";
import { supabase } from "@/services/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StepGoalResult = {
  /** Resolved daily step goal (manual override wins over activity-based). */
  stepGoal: number;
  /** Current activity level stored in the profile. */
  activityLevel: ActivityLevel;
  /** Estimated kcal burned per step (weight-based), 0 when weight unknown. */
  kcalPerStep: number;
  /** True while the initial profile load is in flight. */
  loading: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads activity_level, manual_step_goal, and weight_kg from the user's
 * Supabase profile and returns the resolved daily step goal.
 *
 * Re-fetches every time the containing screen comes into focus so changes
 * made on the profile screen are reflected on the dashboard without a
 * full app restart.
 */
export function useStepGoal(): StepGoalResult {
  const [stepGoal,      setStepGoal]      = useState(calculateDailyStepGoal(DEFAULT_ACTIVITY_LEVEL));
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(DEFAULT_ACTIVITY_LEVEL);
  const [kcalPerStep,   setKcalPerStep]   = useState(0);
  const [loading,       setLoading]       = useState(true);

  const fetchGoal = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || signal?.cancelled) return;

      const { data } = await supabase
        .from("profiles")
        .select("activity_level, manual_step_goal, weight_kg")
        .eq("id", user.id)
        .single();

      if (signal?.cancelled) return;

      const level: ActivityLevel =
        (data?.activity_level as ActivityLevel) ?? DEFAULT_ACTIVITY_LEVEL;
      const manual: number | null = data?.manual_step_goal ?? null;
      const weight: number | null = data?.weight_kg ?? null;

      const goal = calculateDailyStepGoal(level, manual);
      const kps  = weight ? weight * 0.0005 : 0;

      setActivityLevel(level);
      setStepGoal(goal);
      setKcalPerStep(kps);
    } catch (e) {
      // Never crash the dashboard over a missing profile field.
      console.warn("[useStepGoal] fetch failed:", e);
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      fetchGoal(signal);
      return () => { signal.cancelled = true; };
    }, [fetchGoal]),
  );

  return { stepGoal, activityLevel, kcalPerStep, loading };
}
