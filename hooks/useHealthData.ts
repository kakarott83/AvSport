import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getTodayActivity } from '@/lib/healthManager';
import { supabase } from '@/services/supabaseClient';

export type HealthDataResult = {
  healthBurnKcal: number;
  healthSteps: number;
  /**
   * Protein in grams from the mock service (__DEV__ only).
   * On a real device this is always 0 — protein comes from food_logs.
   * Use this to drive the protein ring during emulator testing.
   */
  healthProtein: number;
  syncHealth: boolean;
  refreshHealth: () => Promise<void>;
};

/**
 * Reads today's active calories and step count from the platform health store
 * when the user has enabled sync_health in their profile.
 *
 * Re-fetches on every tab focus, matching the pattern used by useCalorieGoal.
 * Also exposes refreshHealth() for manual pull-to-refresh triggers.
 */
export function useHealthData(): HealthDataResult {
  const [healthBurnKcal, setHealthBurnKcal] = useState(0);
  const [healthSteps,    setHealthSteps]    = useState(0);
  const [healthProtein,  setHealthProtein]  = useState(0);
  const [syncHealth,     setSyncHealth]     = useState(false);

  const refreshHealth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('sync_health')
      .eq('id', user.id)
      .single();

    const enabled = !!(data?.sync_health);
    setSyncHealth(enabled);

    if (!enabled) {
      setHealthBurnKcal(0);
      setHealthSteps(0);
      return;
    }

    try {
      const { kcal, steps, protein } = await getTodayActivity();
      setHealthBurnKcal(kcal);
      setHealthSteps(steps);
      setHealthProtein(protein);
    } catch {
      setHealthBurnKcal(0);
      setHealthSteps(0);
      setHealthProtein(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;

        const { data } = await supabase
          .from('profiles')
          .select('sync_health')
          .eq('id', user.id)
          .single();

        const enabled = !!(data?.sync_health);
        if (!active) return;
        setSyncHealth(enabled);

        if (!enabled) {
          setHealthBurnKcal(0);
          setHealthSteps(0);
          return;
        }

        try {
          const { kcal, steps, protein } = await getTodayActivity();
          if (!active) return;
          setHealthBurnKcal(kcal);
          setHealthSteps(steps);
          setHealthProtein(protein);
        } catch {
          if (!active) return;
          setHealthBurnKcal(0);
          setHealthSteps(0);
          setHealthProtein(0);
        }
      })();

      return () => { active = false; };
    }, []),
  );

  return { healthBurnKcal, healthSteps, healthProtein, syncHealth, refreshHealth };
}
