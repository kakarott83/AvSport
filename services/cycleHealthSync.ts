/**
 * services/cycleHealthSync.ts
 *
 * Übernimmt Periodendaten aus Apple Health / Health Connect in `cycle_events`
 * (source = 'health'). Regeln siehe lib/cycleHealth.ts → planHealthSync.
 *
 * Die Verknüpfung ist opt-in: erst nach "Mit Apple Health / Health Connect
 * verbinden" im Kalender wird abgeglichen (Flag in AsyncStorage, weil iOS den
 * Lese-Status nicht verrät). Best-effort — Fehler blockieren das Tracking nie.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays } from '@/lib/cycle';
import { localISODate, planHealthSync, type StoredCycleEvent } from '@/lib/cycleHealth';
import { HealthManager } from '@/lib/healthManager';
import { supabase } from '@/services/supabaseClient';

const LINKED_KEY = 'cycle_health_linked_v1';
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
  try { await AsyncStorage.setItem(LINKED_KEY, '1'); } catch { /* best-effort */ }
  await syncCycleFromHealth({ force: true });
  return true;
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

      if (__DEV__) {
        console.log(`[cycleHealthSync] +${plan.upserts.length} / -${plan.deletes.length} (health days: ${health.length})`);
      }
      return plan.upserts.length > 0 || plan.deletes.length > 0;
    } catch (e) {
      console.warn('[cycleHealthSync] failed:', e);
      return false;
    } finally {
      running = null;
    }
  })();

  return running;
}
