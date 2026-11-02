/**
 * services/tips/tipService.ts
 *
 * Laden und Speichern rund um den „Tipp des Tages“ (lib/tips.ts).
 * Tabellen: public.tips (nur aktive, per RLS), public.tip_interactions
 * (nur eigene Zeilen). Fehler werden nur geloggt — der Home-Screen darf
 * daran nie hängen bleiben.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { TIP_COLUMNS, TIP_REPEAT_AFTER_DAYS, localDateISO, type Tip, type TipReaction } from '@/lib/tips';
import { supabase } from '@/services/supabaseClient';

export const TIP_CACHE_KEY = 'tip_of_day_v1';

export interface CachedTip {
  date: string;
  userId: string;
  tip: Tip | null;
}

export async function fetchActiveTips(): Promise<Tip[] | null> {
  const { data, error } = await supabase.from('tips').select(TIP_COLUMNS).eq('active', true);
  if (error) {
    console.warn('[Tips] Laden fehlgeschlagen:', error.message);
    return null;
  }
  return (data ?? []) as Tip[];
}

/** tipId → seen_on der letzten Interaktionen (für die Rotation). */
export async function fetchSeenTips(userId: string): Promise<Record<string, string>> {
  const since = localDateISO(new Date(Date.now() - (TIP_REPEAT_AFTER_DAYS + 1) * 86400000));
  const { data, error } = await supabase
    .from('tip_interactions')
    .select('tip_id, seen_on')
    .eq('user_id', userId)
    .gte('seen_on', since);
  if (error) {
    console.warn('[Tips] Interaktionen laden fehlgeschlagen:', error.message);
    return {};
  }
  return Object.fromEntries((data ?? []).map((r) => [r.tip_id as string, r.seen_on as string]));
}

export interface TipUserState {
  opened: boolean;
  reaction: TipReaction | null;
  saved: boolean;
}

export async function fetchTipState(userId: string, tipId: string): Promise<TipUserState | null> {
  const { data, error } = await supabase
    .from('tip_interactions')
    .select('opened, reaction, saved')
    .eq('user_id', userId)
    .eq('tip_id', tipId)
    .maybeSingle();
  if (error || !data) return null;
  return { opened: !!data.opened, reaction: (data.reaction as TipReaction | null) ?? null, saved: !!data.saved };
}

async function upsertInteraction(
  userId: string,
  tipId: string,
  patch: Partial<{ seen_on: string; opened: boolean; reaction: TipReaction | null; saved: boolean }>,
): Promise<void> {
  const { error } = await supabase
    .from('tip_interactions')
    .upsert(
      { user_id: userId, tip_id: tipId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,tip_id' },
    );
  if (error) console.warn('[Tips] Speichern fehlgeschlagen:', error.message);
}

/**
 * Markiert den Tipp als heute gesehen. Wird ein Tipp nach der Pause erneut
 * gezeigt, starten Geöffnet/Reaktion neu (Merken bleibt).
 */
export function recordTipSeen(userId: string, tipId: string): Promise<void> {
  return upsertInteraction(userId, tipId, { seen_on: localDateISO(), opened: false, reaction: null });
}

export function recordTipOpened(userId: string, tipId: string): Promise<void> {
  return upsertInteraction(userId, tipId, { opened: true });
}

export function setTipReaction(userId: string, tipId: string, reaction: TipReaction | null): Promise<void> {
  return upsertInteraction(userId, tipId, { reaction });
}

export function setTipSaved(userId: string, tipId: string, saved: boolean): Promise<void> {
  return upsertInteraction(userId, tipId, { saved });
}

export async function loadCachedTip(): Promise<CachedTip | null> {
  try {
    const raw = await AsyncStorage.getItem(TIP_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedTip) : null;
  } catch {
    return null;
  }
}

export async function saveCachedTip(entry: CachedTip): Promise<void> {
  try {
    await AsyncStorage.setItem(TIP_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // nur Komfort
  }
}
