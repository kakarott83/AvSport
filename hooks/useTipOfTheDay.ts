/**
 * hooks/useTipOfTheDay.ts
 *
 * Liefert den Tipp des Tages für den Home-Screen (Auswahl: lib/tips.ts).
 * - zeigt sofort den Tipp aus dem lokalen Cache (offline, kein Flackern)
 * - lädt dann Profil (Ziel, Geschlecht, tips_enabled), Tipps und gesehene
 *   Tipps und wählt neu
 * - `profiles.tips_enabled = false` (Profil-Schalter) → kein Tipp
 * - „Nicht relevant“ blendet die Karte für heute aus
 *
 * Lädt nicht selbst beim Mount: der Home-Screen ruft `reload()` in seinem
 * useFocusEffect auf, damit z. B. der Profil-Schalter sofort wirkt.
 */

import { useCallback, useRef, useState } from 'react';

import { localDateISO, pickTipOfTheDay, type Tip, type TipReaction } from '@/lib/tips';
import { supabase } from '@/services/supabaseClient';
import {
  fetchActiveTips,
  fetchSeenTips,
  fetchTipState,
  loadCachedTip,
  recordTipOpened,
  recordTipSeen,
  saveCachedTip,
  setTipReaction,
  setTipSaved,
  type TipUserState,
} from '@/services/tips/tipService';

const EMPTY_STATE: TipUserState = { opened: false, reaction: null, saved: false };

export function useTipOfTheDay() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [state, setState] = useState<TipUserState>(EMPTY_STATE);
  const userIdRef = useRef<string | null>(null);
  const seenRecorded = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTip(null); return; }
    userIdRef.current = user.id;
    const today = localDateISO();

    const cached = await loadCachedTip();
    if (cached && cached.date === today && cached.userId === user.id) setTip(cached.tip);

    const [{ data: profile }, tips, seen] = await Promise.all([
      supabase.from('profiles').select('calorie_goal, gender, tips_enabled').eq('id', user.id).maybeSingle(),
      fetchActiveTips(),
      fetchSeenTips(user.id),
    ]);

    // Offline/Fehler → beim Cache bleiben
    if (tips === null) return;

    const picked = profile?.tips_enabled === false
      ? null
      : pickTipOfTheDay({
          tips,
          date: today,
          userId: user.id,
          goal: profile?.calorie_goal ?? null,
          gender: profile?.gender ?? null,
          seen,
        });

    setTip(picked);
    void saveCachedTip({ date: today, userId: user.id, tip: picked });

    if (!picked) return;
    const existing = await fetchTipState(user.id, picked.id);
    // Eine Reaktion von einem früheren Tag gilt nicht für heute
    const seenToday = seen[picked.id] === today;
    setState(existing && seenToday ? existing : { ...EMPTY_STATE, saved: existing?.saved ?? false });

    if (!seenToday && seenRecorded.current !== today + picked.id) {
      seenRecorded.current = today + picked.id;
      void recordTipSeen(user.id, picked.id);
    }
  }, []);

  const markOpened = useCallback(() => {
    const userId = userIdRef.current;
    if (!tip || !userId || state.opened) return;
    setState((s) => ({ ...s, opened: true }));
    void recordTipOpened(userId, tip.id);
  }, [tip, state.opened]);

  const react = useCallback((reaction: TipReaction) => {
    const userId = userIdRef.current;
    if (!tip || !userId) return;
    const next = state.reaction === reaction ? null : reaction;
    setState((s) => ({ ...s, reaction: next }));
    void setTipReaction(userId, tip.id, next);
  }, [tip, state.reaction]);

  const toggleSaved = useCallback(() => {
    const userId = userIdRef.current;
    if (!tip || !userId) return;
    const next = !state.saved;
    setState((s) => ({ ...s, saved: next }));
    void setTipSaved(userId, tip.id, next);
  }, [tip, state.saved]);

  return {
    /** null = kein Tipp (abgeschaltet, keiner passend oder „Nicht relevant“) */
    tip: state.reaction === 'dismiss' ? null : tip,
    /** auch bei „Nicht relevant“ gesetzt, damit das offene Detail nicht verschwindet */
    currentTip: tip,
    state,
    reload: load,
    markOpened,
    react,
    toggleSaved,
  };
}
