/**
 * Prüft die Eingaben für „Tipp speichern“ aus dem Admin-Panel, bevor sie an
 * admin_upsert_tip() gehen (Migration 20261102120000_daily_tips.sql). Die
 * CHECK-Constraints der Tabelle sind die zweite Absicherung.
 * Reine Funktionen, ohne Deno-APIs — testbar mit Jest wie security.ts.
 */

import { isUuid } from './security.ts';

export const TIP_CATEGORIES = ['training', 'nutrition', 'recovery', 'mindset'] as const;
export const TIP_GOALS = ['lose', 'maintain', 'gain'] as const;
export const TIP_GENDERS = ['male', 'female'] as const;
export const TIP_CTAS = ['scan', 'day_log', 'nutrition', 'water', 'plans', 'create_plan', 'calendar', 'body_stats'] as const;

export const TIP_LIMITS = {
  title: { min: 3, max: 80 },
  body: { min: 10, max: 600 },
} as const;

export interface TipInput {
  id: string | null;
  slug: string | null;
  category: string;
  title_de: string;
  body_de: string;
  title_en: string;
  body_en: string;
  goals: string[];
  gender: string | null;
  cta: string | null;
  publish_on: string | null;
  active: boolean;
}

type Result = { ok: true; value: TipInput } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optional(value: unknown): string | null {
  const s = str(value);
  return s === '' ? null : s;
}

function checkText(label: string, value: string, limits: { min: number; max: number }): string | null {
  if (value.length < limits.min || value.length > limits.max) {
    return `${label} muss ${limits.min}–${limits.max} Zeichen lang sein.`;
  }
  return null;
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function sanitizeTipInput(raw: unknown): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'tip fehlt.' };
  const r = raw as Record<string, unknown>;

  const id = optional(r.id);
  if (id !== null && !isUuid(id)) return { ok: false, error: 'Ungültige id.' };

  const slug = optional(r.slug);
  if (slug !== null && !SLUG_RE.test(slug)) {
    return { ok: false, error: 'Slug: nur Kleinbuchstaben, Ziffern und Bindestriche (max. 64).' };
  }

  const category = str(r.category);
  if (!(TIP_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: 'Ungültige Kategorie.' };

  const title_de = str(r.title_de);
  const body_de = str(r.body_de);
  const title_en = str(r.title_en);
  const body_en = str(r.body_en);
  const textError =
    checkText('Titel (DE)', title_de, TIP_LIMITS.title) ??
    checkText('Text (DE)', body_de, TIP_LIMITS.body) ??
    checkText('Titel (EN)', title_en, TIP_LIMITS.title) ??
    checkText('Text (EN)', body_en, TIP_LIMITS.body);
  if (textError) return { ok: false, error: textError };

  if (r.goals != null && !Array.isArray(r.goals)) return { ok: false, error: 'Ziele müssen eine Liste sein.' };
  const goals = [...new Set(((r.goals as unknown[]) ?? []).map(str))];
  if (goals.some((g) => !(TIP_GOALS as readonly string[]).includes(g))) return { ok: false, error: 'Ungültiges Ziel.' };

  const gender = optional(r.gender);
  if (gender !== null && !(TIP_GENDERS as readonly string[]).includes(gender)) {
    return { ok: false, error: 'Ungültiges Geschlecht.' };
  }

  const cta = optional(r.cta);
  if (cta !== null && !(TIP_CTAS as readonly string[]).includes(cta)) return { ok: false, error: 'Ungültiger Aktions-Button.' };

  const publish_on = optional(r.publish_on);
  if (publish_on !== null && !isValidDate(publish_on)) return { ok: false, error: 'Ungültiges Datum.' };

  return {
    ok: true,
    value: {
      id,
      slug,
      category,
      title_de,
      body_de,
      title_en,
      body_en,
      goals,
      gender,
      cta,
      publish_on,
      active: r.active !== false,
    },
  };
}
