import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getTodayActivity } from '@/lib/healthManager';
import { syncStepsToSupabase } from '@/lib/healthSync';
import { supabase } from '@/services/supabaseClient';

export type HealthDataResult = {
  healthBurnKcal: number;
  healthSteps:    number;
  healthProtein:  number;
  syncHealth:     boolean;
  refreshHealth:  () => Promise<void>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches today's step + calorie data from Health Connect (or mock),
 * then writes the result to Supabase daily_logs so the data is persisted.
 *
 * Returns the fetched values or zeros on any error.
 */
async function fetchAndPersist(userId: string): Promise<{
  kcal: number; steps: number; protein: number;
}> {
  const { kcal, steps, protein } = await getTodayActivity();

  // Fire-and-forget: don't block the UI on the DB write.
  // If it fails, the next focus-event will retry automatically.
  syncStepsToSupabase(userId, steps, kcal).catch((e) =>
    console.error('[useHealthData] background persist error:', e),
  );

  return { kcal, steps, protein };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads today's active calories and step count from the platform health store
 * ONLY when the user has sync_health = true in their Supabase profile.
 *
 * Flow on focus:
 *   1. Query profiles.sync_health
 *   2. If false  → reset state to 0, skip HC call
 *   3. If true   → getTodayActivity() → update UI → persist to daily_logs
 *
 * Re-fetches on every tab focus. Exposes refreshHealth() for pull-to-refresh.
 */
export function useHealthData(): HealthDataResult {
  const [healthBurnKcal, setHealthBurnKcal] = useState(0);
  const [healthSteps,    setHealthSteps]    = useState(0);
  const [healthProtein,  setHealthProtein]  = useState(0);
  const [syncHealth,     setSyncHealth]     = useState(false);

  // ── refreshHealth (used by pull-to-refresh) ─────────────────────────────────

  const refreshHealth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Step 1: check Supabase flag before touching any native API
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
      setHealthProtein(0);
      return;
    }

    // Step 2: fetch from Health Connect + persist
    try {
      const { kcal, steps, protein } = await fetchAndPersist(user.id);
      setHealthBurnKcal(kcal);
      setHealthSteps(steps);
      setHealthProtein(protein);
    } catch {
      setHealthBurnKcal(0);
      setHealthSteps(0);
      setHealthProtein(0);
    }
  }, []);

  // ── useFocusEffect (runs every time the tab becomes active) ─────────────────

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;

        // Step 1: check Supabase flag — no native call without explicit consent
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
          setHealthProtein(0);
          return;
        }

        // Step 2: fetch + persist
        try {
          const { kcal, steps, protein } = await fetchAndPersist(user.id);
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
