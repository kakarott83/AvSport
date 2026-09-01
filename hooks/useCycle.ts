/**
 * hooks/useCycle.ts
 *
 * Lädt die Blutungs-Historie (`cycle_events`) + die relevanten Profilfelder
 * und stellt Erfassung (`logFlow` / `removeFlow`) sowie die abgeleiteten
 * Phasen/Prognosen (via lib/cycle.ts) bereit.
 *
 * Bei jedem Laden werden die Zyklus-Push-Erinnerungen mit den Prognosen
 * synchronisiert (services/notifications/cycleReminderService.ts). Alles
 * best-effort — ein Notification- oder Spiegel-Fehler darf das Tracking nie
 * blockieren. `logFlow` spiegelt den Blutungstag zusätzlich als `period`-Tag
 * in `daily_logs`, damit der Kalender-Tab und useCalorieGoal weiter passen.
 */

import { useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  buildPhaseCalendar,
  getCycleOverview,
  type CycleEvent,
  type CycleOverview,
  type CycleProfile,
  type DayPhase,
} from '@/lib/cycle';
import { sanitizeCycleReminderSettings } from '@/lib/cycleReminders';
import { syncCycleReminders } from '@/services/notifications/cycleReminderService';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const CYCLE_PROFILE_COLUMNS =
  'cycle_length_days, period_duration_days, cycle_period_reminder, cycle_fertile_reminder';

interface CycleProfileRow extends CycleProfile {
  cycle_period_reminder: boolean | null;
  cycle_fertile_reminder: boolean | null;
}

const EMPTY_PROFILE: CycleProfileRow = {
  cycle_length_days: null,
  period_duration_days: null,
  cycle_period_reminder: null,
  cycle_fertile_reminder: null,
};

export interface CycleResult {
  loading: boolean;
  overview: CycleOverview;
  events: CycleEvent[];
  /** Manual cycle/period length currently stored in the profile (fallback values). */
  profileCycleLength: number | null;
  profilePeriodLength: number | null;
  /** flow value (1–4) keyed by ISO date, for the calendar / quick-entry UI. */
  flowByDate: Map<string, number>;
  /** Phases for an arbitrary visible range, keyed by ISO date. Pure + cheap. */
  phasesForRange: (rangeStart: string, rangeEnd: string) => Map<string, DayPhase>;
  logFlow: (date: string, flow: number) => Promise<void>;
  removeFlow: (date: string) => Promise<void>;
  /** Write the history-derived averages into the profile (after user confirms). */
  applyAverages: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useCycle(): CycleResult {
  const [events, setEvents] = useState<CycleEvent[]>([]);
  const [profile, setProfile] = useState<CycleProfileRow>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || signal?.cancelled) return;

      const [eventsRes, profileRes] = await Promise.all([
        supabase
          .from('cycle_events')
          .select('date, flow')
          .eq('user_id', user.id)
          .order('date', { ascending: true }),
        supabase.from('profiles').select(CYCLE_PROFILE_COLUMNS).eq('id', user.id).maybeSingle(),
      ]);

      if (signal?.cancelled) return;

      const rows = (eventsRes.data ?? []) as CycleEvent[];
      const profileRow = { ...EMPTY_PROFILE, ...(profileRes.data as CycleProfileRow | null) };

      setEvents(rows);
      setProfile(profileRow);

      const overview = getCycleOverview(rows, profileRow, todayISO());
      void syncCycleReminders({
        settings: sanitizeCycleReminderSettings({
          periodEnabled: profileRow.cycle_period_reminder ?? false,
          fertileEnabled: profileRow.cycle_fertile_reminder ?? false,
        }),
        nextPeriod: overview.nextPeriod,
        nextOvulation: overview.nextOvulation,
        today: todayISO(),
      });
    } catch (e) {
      console.warn('[useCycle] fetch failed:', e);
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

  const refresh = useCallback(() => fetchData(), [fetchData]);

  const logFlow = useCallback(async (date: string, flow: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('cycle_events')
      .upsert({ user_id: user.id, date, flow }, { onConflict: 'user_id,date' });
    if (error) { console.warn('[useCycle] logFlow failed:', error.message); return; }

    setEvents((prev) => {
      const without = prev.filter((e) => e.date !== date);
      return [...without, { date, flow }].sort((a, b) => a.date.localeCompare(b.date));
    });

    // Spiegel in daily_logs (period-Tag) — best-effort, blockiert nie.
    void mirrorPeriodTag(user.id, date, true);
    void refresh();
  }, [refresh]);

  const removeFlow = useCallback(async (date: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('cycle_events')
      .delete()
      .eq('user_id', user.id)
      .eq('date', date);
    if (error) { console.warn('[useCycle] removeFlow failed:', error.message); return; }

    setEvents((prev) => prev.filter((e) => e.date !== date));
    void mirrorPeriodTag(user.id, date, false);
    void refresh();
  }, [refresh]);

  const flowByDate = useMemo(
    () => new Map(events.map((e) => [e.date, e.flow])),
    [events],
  );

  const overview = useMemo(
    () => getCycleOverview(events, profile, todayISO()),
    [events, profile],
  );

  const phasesForRange = useCallback(
    (rangeStart: string, rangeEnd: string) =>
      new Map(
        buildPhaseCalendar(events, profile, rangeStart, rangeEnd, todayISO()).map((p) => [p.date, p]),
      ),
    [events, profile],
  );

  const applyAverages = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        cycle_length_days: overview.stats.avgCycleLength,
        period_duration_days: overview.stats.avgPeriodLength,
      })
      .eq('id', user.id);
    if (error) { console.warn('[useCycle] applyAverages failed:', error.message); return; }
    void refresh();
  }, [overview.stats.avgCycleLength, overview.stats.avgPeriodLength, refresh]);

  return {
    loading,
    overview,
    events,
    profileCycleLength: profile.cycle_length_days ?? null,
    profilePeriodLength: profile.period_duration_days ?? null,
    flowByDate,
    phasesForRange,
    logFlow,
    removeFlow,
    applyAverages,
    refresh,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// daily_logs mirror — keeps the calendar tab's "period" tag in sync
// ─────────────────────────────────────────────────────────────────────────────

async function mirrorPeriodTag(userId: string, date: string, present: boolean): Promise<void> {
  try {
    const { data } = await supabase
      .from('daily_logs')
      .select('tags, note')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    const current: string[] = Array.isArray(data?.tags) ? (data!.tags as string[]) : [];
    const has = current.includes('period');
    if (present === has) return;

    const tags = present ? [...current, 'period'] : current.filter((t) => t !== 'period');

    if (tags.length === 0 && !data?.note) {
      await supabase.from('daily_logs').delete().eq('user_id', userId).eq('date', date);
      return;
    }

    await supabase.from('daily_logs').upsert(
      { user_id: userId, date, tags, note: data?.note ?? null },
      { onConflict: 'user_id,date' },
    );
  } catch (e) {
    console.warn('[useCycle] mirrorPeriodTag failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab-Sichtbarkeit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ob der "Periode"-Tab angezeigt wird: nur wenn im Profil das Geschlecht
 * "weiblich" ist. Wird bei jeder Navigation und bei App-Fokus neu geprüft,
 * damit der Tab direkt nach dem Umstellen im Profil erscheint/verschwindet.
 */
export function useCycleTabEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;
        const { data } = await supabase
          .from('profiles')
          .select('gender')
          .eq('id', user.id)
          .maybeSingle();
        if (active) setEnabled(data?.gender === 'female');
      } catch {
        // letzten bekannten Wert behalten
      }
    };

    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => { active = false; sub.remove(); };
  }, [pathname]);

  return enabled;
}

