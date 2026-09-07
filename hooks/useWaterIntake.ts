/**
 * hooks/useWaterIntake.ts
 *
 * Lädt Profildaten (Gewicht, Aktivität, manuelles Ziel, Erinnerungs-
 * Einstellungen) + heutige Trinkmengen und stellt addIntake/removeLastIntake
 * bereit. Bei jedem Laden werden die täglichen Push-Erinnerungen mit den
 * Profil-Einstellungen synchronisiert (services/notifications/
 * waterReminderService.ts); erreicht eine Zugabe das Tagesziel, kommt einmalig
 * eine Erfolgs-Notification. Alles best-effort — ein Notification-Fehler darf
 * das Tracking nie blockieren.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { calculateWaterGoal } from '@/lib/waterGoal';
import { sanitizeWaterReminderSettings, type WaterReminderSettings } from '@/lib/waterReminders';
import { sendGoalReachedNotification, syncWaterReminders } from '@/services/notifications/waterReminderService';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────

type IntakeRow = { id: string; ml: number };

export interface WaterIntakeResult {
  goalMl: number;
  consumedMl: number;
  remainingMl: number;
  consumedPercent: number;
  hasIntakeToday: boolean;
  loading: boolean;
  addIntake: (ml: number) => Promise<boolean>;
  removeLastIntake: () => Promise<void>;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

const PROFILE_COLUMNS =
  'weight_kg, water_goal_ml, activity_level, water_reminder_enabled, ' +
  'water_reminder_start_hour, water_reminder_end_hour, water_reminder_interval_hours';

function settingsFromProfile(row: any): WaterReminderSettings {
  return sanitizeWaterReminderSettings({
    enabled:       row?.water_reminder_enabled ?? false,
    startHour:     row?.water_reminder_start_hour ?? undefined,
    endHour:       row?.water_reminder_end_hour ?? undefined,
    intervalHours: row?.water_reminder_interval_hours ?? undefined,
  });
}

export function useWaterIntake(): WaterIntakeResult {
  const [goalMl, setGoalMl]     = useState(0);
  const [intakes, setIntakes]   = useState<IntakeRow[]>([]);
  const [loading, setLoading]   = useState(true);

  const fetchData = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || signal?.cancelled) return;

      const { startIso, endIso } = todayRange();

      const [profileRes, intakesRes] = await Promise.all([
        supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single(),
        supabase
          .from('water_intakes')
          .select('id, ml')
          .eq('user_id', user.id)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: true }),
      ]);

      if (signal?.cancelled) return;

      const profileRow = profileRes.data as any;
      const { goalMl: resolvedGoal } = calculateWaterGoal(
        profileRow?.weight_kg ?? null,
        profileRow?.water_goal_ml ?? null,
        profileRow?.activity_level ?? null,
      );
      const rows = (intakesRes.data ?? []) as IntakeRow[];

      setGoalMl(resolvedGoal);
      setIntakes(rows);

      void syncWaterReminders({ goalMl: resolvedGoal, settings: settingsFromProfile(profileRow) });
    } catch (e) {
      console.warn('[useWaterIntake] fetch failed:', e);
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      fetchData(signal);
      return () => { signal.cancelled = true; };
    }, [fetchData]),
  );

  const addIntake = useCallback(async (ml: number): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('water_intakes')
      .insert({ user_id: user.id, ml })
      .select('id, ml')
      .single();
    if (error || !data) { console.warn('[useWaterIntake] addIntake failed:', error?.message); return false; }

    const previousConsumed = intakes.reduce((sum, r) => sum + r.ml, 0);
    const nextIntakes = [...intakes, data as IntakeRow];
    setIntakes(nextIntakes);

    // Genau beim Überschreiten des Ziels einmalig gratulieren. Die täglichen
    // Erinnerungen laufen unabhängig davon weiter (siehe syncWaterReminders).
    const crossedGoal = goalMl > 0 && previousConsumed < goalMl && previousConsumed + ml >= goalMl;
    if (crossedGoal) {
      void sendGoalReachedNotification({ goalMl });
    }
    return true;
  }, [intakes, goalMl]);

  const removeLastIntake = useCallback(async () => {
    const last = intakes[intakes.length - 1];
    if (!last) return;

    const { error } = await supabase.from('water_intakes').delete().eq('id', last.id);
    if (error) { console.warn('[useWaterIntake] removeLastIntake failed:', error.message); return; }

    setIntakes(intakes.slice(0, -1));
  }, [intakes]);

  const consumedMl       = intakes.reduce((sum, r) => sum + r.ml, 0);
  const remainingMl      = Math.max(0, goalMl - consumedMl);
  const consumedPercent  = goalMl > 0 ? Math.round((consumedMl / goalMl) * 100) : 0;

  return {
    goalMl,
    consumedMl,
    remainingMl,
    consumedPercent,
    hasIntakeToday: intakes.length > 0,
    loading,
    addIntake,
    removeLastIntake,
  };
}
