/**
 * services/cycleHealthSync.ts
 *
 * Übernimmt Periodendaten aus Apple Health / Health Connect in `cycle_events`
 * und Ovulationstests in `cycle_ovulation_tests` (jeweils source = 'health').
 * Regeln siehe lib/cycleHealth.ts → planHealthSync / planOvulationSync.
 *
 * Die Verknüpfung ist opt-in: erst nach "Mit Apple Health / Health Connect
 * verbinden" im Kalender wird abgeglichen (Flag in AsyncStorage, weil iOS den
 * Lese-Status nicht verrät). Best-effort — Fehler blockieren das Tracking nie.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays } from '@/lib/cycle';
import {
  localISODate,
  planHealthSync,
  planOvulationSync,
  type StoredCycleEvent,
  type StoredOvulationTest,
} from '@/lib/cycleHealth';
import { HealthManager } from '@/lib/healthManager';
import { supabase } from '@/services/supabaseClient';

const LINKED_KEY = 'cycle_health_linked_v1';
/**
 * Gesetzt, sobald die Leseberechtigung inkl. Ovulationstests angefragt wurde.
 * Wer vor diesem Update verknüpft hat, bekommt im Kalender einmal den Button
 * „Ovulationstests übernehmen“ (iOS zeigt das Health-Blatt nur für neue Typen).
 */
const OVULATION_REQUESTED_KEY = 'cycle_health_ovulation_v1';
const SYNC_DAYS = 365;
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let lastSyncAt = 0;
let running: Promise<boolean> | null = null;

export async function isCycleHealthLinked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LINKED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Fragt die Leseberechtigung an und gleicht bei Erfolg sofort ab. */
export async function linkCycleHealth(): Promise<boolean> {
  const ok = await HealthManager.requestMenstruationPermission();
  if (!ok) return false;
  try {
    await AsyncStorage.multiSet([[LINKED_KEY, '1'], [OVULATION_REQUESTED_KEY, '1']]);
  } catch { /* best-effort */ }
  await syncCycleFromHealth({ force: true });
  return true;
}

/** Wurde die Berechtigung für Ovulationstests schon angefragt? */
export async function isOvulationHealthRequested(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OVULATION_REQUESTED_KEY)) === '1';
  } catch {
    return true; // im Zweifel keinen Button anzeigen
  }
}

export async function unlinkCycleHealth(): Promise<void> {
  try { await AsyncStorage.removeItem(LINKED_KEY); } catch { /* best-effort */ }
}

/**
 * Gleicht die letzten 365 Tage ab. Gibt true zurück, wenn sich etwas geändert
 * hat. Ohne `force` höchstens alle 5 Minuten.
 */
export async function syncCycleFromHealth(opts: { force?: boolean } = {}): Promise<boolean> {
  if (running) return running;
  if (!opts.force && Date.now() - lastSyncAt < MIN_INTERVAL_MS) return false;
  if (!(await isCycleHealthLinked())) return false;

  running = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const now = new Date();
      const windowEnd = localISODate(now);
      const windowStart = addDays(windowEnd, -SYNC_DAYS);
      const startOfWindow = new Date(now);
      startOfWindow.setDate(startOfWindow.getDate() - SYNC_DAYS);
      startOfWindow.setHours(0, 0, 0, 0);

      const health = await HealthManager.fetchMenstruationDays({
        startTime: startOfWindow.toISOString(),
        endTime: now.toISOString(),
      });
      lastSyncAt = Date.now();
      if (health == null) return false; // nicht lesbar → nichts anfassen

      const { data, error } = await supabase
        .from('cycle_events')
        .select('date, flow, source')
        .eq('user_id', user.id)
        .gte('date', windowStart)
        .lte('date', windowEnd);
      if (error) { console.warn('[cycleHealthSync] load failed:', error.message); return false; }

      const plan = planHealthSync((data ?? []) as StoredCycleEvent[], health, windowStart, windowEnd);

      if (plan.upserts.length > 0) {
        const { error: upErr } = await supabase.from('cycle_events').upsert(
          plan.upserts.map((d) => ({ user_id: user.id, date: d.date, flow: d.flow, source: 'health' })),
          { onConflict: 'user_id,date' },
        );
        if (upErr) console.warn('[cycleHealthSync] upsert failed:', upErr.message);
      }
      if (plan.deletes.length > 0) {
        const { error: delErr } = await supabase
          .from('cycle_events')
          .delete()
          .eq('user_id', user.id)
          .eq('source', 'health')
          .in('date', plan.deletes);
        if (delErr) console.warn('[cycleHealthSync] delete failed:', delErr.message);
      }

      const ovulationChanged = await syncOvulationTests(user.id, startOfWindow, now, windowStart, windowEnd);

      if (__DEV__) {
        console.log(`[cycleHealthSync] +${plan.upserts.length} / -${plan.deletes.length} (health days: ${health.length})`);
      }
      return plan.upserts.length > 0 || plan.deletes.length > 0 || ovulationChanged;
    } catch (e) {
      console.warn('[cycleHealthSync] failed:', e);
      return false;
    } finally {
      running = null;
    }
  })();

  return running;
}

/** Ovulationstests abgleichen (best-effort, ohne Berechtigung passiert nichts). */
async function syncOvulationTests(
  userId: string,
  start: Date,
  end: Date,
  windowStart: string,
  windowEnd: string,
): Promise<boolean> {
  try {
    const health = await HealthManager.fetchOvulationTests({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    if (health == null) return false;

    const { data, error } = await supabase
      .from('cycle_ovulation_tests')
      .select('date, result, source')
      .eq('user_id', userId)
      .gte('date', windowStart)
      .lte('date', windowEnd);
    if (error) { console.warn('[cycleHealthSync] ovulation load failed:', error.message); return false; }

    const plan = planOvulationSync((data ?? []) as StoredOvulationTest[], health, windowStart, windowEnd);

    if (plan.upserts.length > 0) {
      const { error: upErr } = await supabase.from('cycle_ovulation_tests').upsert(
        plan.upserts.map((t) => ({ user_id: userId, date: t.date, result: t.result, source: 'health' })),
        { onConflict: 'user_id,date' },
      );
      if (upErr) console.warn('[cycleHealthSync] ovulation upsert failed:', upErr.message);
    }
    if (plan.deletes.length > 0) {
      const { error: delErr } = await supabase
        .from('cycle_ovulation_tests')
        .delete()
        .eq('user_id', userId)
        .eq('source', 'health')
        .in('date', plan.deletes);
      if (delErr) console.warn('[cycleHealthSync] ovulation delete failed:', delErr.message);
    }
    return plan.upserts.length > 0 || plan.deletes.length > 0;
  } catch (e) {
    console.warn('[cycleHealthSync] ovulation sync failed:', e);
    return false;
  }
}
