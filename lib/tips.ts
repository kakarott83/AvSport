/**
 * lib/tips.ts — „Tipp des Tages“ auf dem Home-Screen.
 *
 * Reine Helfer ohne React/Supabase (testbar wie lib/mealReminder.ts).
 * Daten: public.tips (Migration 20261102120000_daily_tips.sql), gepflegt über
 * die Admin-Website. Laden/Speichern: services/tips/tipService.ts.
 */

import type { Language } from '@/lib/i18n';

export type TipCategory = 'training' | 'nutrition' | 'recovery' | 'mindset';
export type TipGoal = 'lose' | 'maintain' | 'gain';
export type TipCta =
  | 'scan' | 'day_log' | 'nutrition' | 'water' | 'plans' | 'create_plan' | 'calendar' | 'body_stats';
export type TipReaction = 'like' | 'dismiss';

export interface Tip {
  id: string;
  category: TipCategory;
  title_de: string;
  body_de: string;
  title_en: string;
  body_en: string;
  goals: TipGoal[] | null;
  gender: 'male' | 'female' | null;
  cta: TipCta | null;
  /** YYYY-MM-DD: fest an diesem Tag; null = Rotation */
  publish_on: string | null;
  active: boolean;
}

/** Spalten, die die App aus public.tips liest. */
export const TIP_COLUMNS =
  'id, category, title_de, body_de, title_en, body_en, goals, gender, cta, publish_on, active';

/** Wie lange ein gesehener Tipp in der Rotation pausiert. */
export const TIP_REPEAT_AFTER_DAYS = 60;

export const TIP_CATEGORY_ICONS: Record<TipCategory, string> = {
  training: 'fitness-center',
  nutrition: 'restaurant',
  recovery: 'bedtime',
  mindset: 'self-improvement',
};

export const TIP_CATEGORY_COLORS: Record<TipCategory, string> = {
  training: '#FF9100',
  nutrition: '#22C55E',
  recovery: '#7C8CFF',
  mindset: '#00E5FF',
};

/**
 * Ziele der Aktions-Buttons. `scan` und `water` behandelt der Home-Screen
 * selbst (Scanner öffnen bzw. Wasser-Karte), alles andere ist eine Route.
 */
export const CTA_ROUTES: Record<Exclude<TipCta, 'scan' | 'water'>, { pathname: string }> = {
  // dayLog=<zeitstempel> öffnet „Tag erfassen“ (wie die Mahlzeiten-Erinnerung)
  day_log: { pathname: '/(app)/(tabs)/nutrition' },
  nutrition: { pathname: '/(app)/(tabs)/nutrition' },
  plans: { pathname: '/(app)/(tabs)/plans' },
  create_plan: { pathname: '/create-plan' },
  calendar: { pathname: '/(app)/(tabs)/calendar' },
  body_stats: { pathname: '/body-stats' },
};

export function localizeTip(tip: Tip, lang: Language): { title: string; body: string } {
  return lang === 'en'
    ? { title: tip.title_en, body: tip.body_en }
    : { title: tip.title_de, body: tip.body_de };
}

/** Lokales Datum als YYYY-MM-DD (nicht UTC — der Tipp wechselt um Mitternacht Ortszeit). */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000);
}

/** Kleiner, stabiler String-Hash (FNV-1a), damit der Tipp den ganzen Tag gleich bleibt. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tipMatchesUser(
  tip: Tip,
  goal: string | null | undefined,
  gender: string | null | undefined,
): boolean {
  if (!tip.active) return false;
  const goals = tip.goals ?? [];
  if (goals.length > 0 && (!goal || !goals.includes(goal as TipGoal))) return false;
  if (tip.gender && tip.gender !== gender) return false;
  return true;
}

export interface PickTipInput {
  tips: Tip[];
  /** Heutiges Datum, YYYY-MM-DD */
  date: string;
  userId: string;
  goal?: string | null;
  gender?: string | null;
  /** tipId → seen_on (YYYY-MM-DD) bisheriger Interaktionen */
  seen?: Record<string, string>;
}

/**
 * Wählt den Tipp des Tages:
 *  1. nur aktive Tipps, die zu Ziel und Geschlecht passen
 *  2. ein fest für heute geplanter Tipp (publish_on) gewinnt
 *  3. sonst Rotation (ohne publish_on): bevorzugt nicht in den letzten
 *     60 Tagen gesehene (heute gesehene zählen als ungesehen, damit der
 *     Tipp beim zweiten Öffnen gleich bleibt); sind alle gesehen, die am
 *     längsten nicht gesehenen
 *  4. daraus deterministisch per Hash aus Datum + User-ID
 */
export function pickTipOfTheDay({ tips, date, userId, goal, gender, seen = {} }: PickTipInput): Tip | null {
  const eligible = tips.filter((t) => tipMatchesUser(t, goal, gender));
  if (eligible.length === 0) return null;

  const scheduled = eligible.filter((t) => t.publish_on === date);
  if (scheduled.length > 0) {
    return scheduled.sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  const rotation = eligible.filter((t) => !t.publish_on).sort((a, b) => a.id.localeCompare(b.id));
  if (rotation.length === 0) return null;

  const ageOf = (t: Tip): number => {
    const s = seen[t.id];
    if (!s || s >= date) return Infinity;
    return daysBetween(s, date);
  };

  let pool = rotation.filter((t) => ageOf(t) > TIP_REPEAT_AFTER_DAYS);
  if (pool.length === 0) {
    const oldest = Math.max(...rotation.map(ageOf));
    pool = rotation.filter((t) => ageOf(t) === oldest);
  }

  return pool[hashString(`${date}|${userId}`) % pool.length];
}
