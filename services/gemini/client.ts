/**
 * services/gemini/client.ts
 *
 * Privater Client für KI-Anfragen. Wird nur innerhalb von services/gemini/
 * (und services/nutrition/foodRecognition.ts) verwendet.
 *
 * Gemini wird nicht mehr direkt aufgerufen, sondern über die Edge Function
 * supabase/functions/ai-proxy: Dort liegen der API-Key, die Limit-Prüfung
 * (Tageslimit, Monatslimit, Kosten-Deckel, Sperren — steuerbar im
 * Admin-Panel) und das Logging in ai_logs. Der Client kann die Limits damit
 * nicht mehr umgehen.
 */

import { supabase } from "@/services/supabaseClient";

// ─── Konfiguration ────────────────────────────────────────────────────────────

/**
 * Standard-Tageslimit für kostenlose Accounts. Der tatsächlich geltende Wert
 * kommt vom Server (public.ai_limit_defaults bzw. user_limits) — dieser Wert
 * dient nur als Fallback für die Fehlermeldung.
 */
const DEFAULT_DAILY_REQUEST_LIMIT = 10;

/**
 * Monatliches KI-Kostenlimit für Premium-Abonnenten (Standard, serverseitig in
 * public.ai_limit_defaults hinterlegt). Gemini rechnet in USD ab; es wird
 * bewusst konservativ 1 EUR ≈ 1 USD angenommen.
 */
const PREMIUM_MONTHLY_COST_CAP_EUR = 10;
const PREMIUM_MONTHLY_COST_CAP_USD = PREMIUM_MONTHLY_COST_CAP_EUR;

/**
 * Planungsannahme für die teuerste realistische Einzelanfrage — bewusst über
 * dem bisher in ai_logs beobachteten Maximum (~0,0166 $ für eine große
 * Trainingsplan-Generierung).
 */
const WORST_CASE_COST_PER_REQUEST_USD = 0.02;

/**
 * Konservative Untergrenze, wie viele Anfragen ein Premium-User pro Monat
 * mindestens hat, bevor der Kosten-Deckel greift — für Paywall-Texte o. Ä.
 */
export function estimateMinMonthlyPremiumRequests(): number {
  return Math.floor(PREMIUM_MONTHLY_COST_CAP_USD / WORST_CASE_COST_PER_REQUEST_USD);
}

function proxyUrl(): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("EXPO_PUBLIC_SUPABASE_URL ist nicht gesetzt");
  return `${base.replace(/\/+$/, "")}/functions/v1/ai-proxy`;
}

// ─── Fehler ───────────────────────────────────────────────────────────────────

/** Wird geworfen, wenn ein User sein tägliches KI-Anfragelimit erreicht hat. */
export class GeminiDailyLimitError extends Error {
  constructor(limit: number = DEFAULT_DAILY_REQUEST_LIMIT) {
    super(
      `Du hast dein tägliches Limit von ${limit} KI-Anfragen erreicht. ` +
        "Bitte versuche es morgen erneut.",
    );
    this.name = "GeminiDailyLimitError";
  }
}

/** Wird geworfen, wenn ein User sein monatliches KI-Anfragelimit erreicht hat. */
export class GeminiMonthlyLimitError extends Error {
  constructor(limit?: number | null) {
    super(
      (limit != null
        ? `Du hast dein monatliches Limit von ${limit} KI-Anfragen erreicht. `
        : "Du hast dein monatliches Limit an KI-Anfragen erreicht. ") +
        "Das Limit wird zu Monatsbeginn zurückgesetzt.",
    );
    this.name = "GeminiMonthlyLimitError";
  }
}

/** Wird geworfen, wenn ein Premium-User sein monatliches KI-Kostenlimit erreicht hat. */
export class GeminiCostLimitError extends Error {
  constructor() {
    super(
      `Du hast dein monatliches KI-Kostenlimit von ${PREMIUM_MONTHLY_COST_CAP_EUR}€ erreicht. ` +
        "Das Limit wird zu Monatsbeginn zurückgesetzt.",
    );
    this.name = "GeminiCostLimitError";
  }
}

/** Wird geworfen, wenn der Zugang zu den KI-Funktionen im Admin-Panel gesperrt wurde. */
export class GeminiAccessBlockedError extends Error {
  constructor() {
    super("Dein Zugang zu den KI-Funktionen ist derzeit gesperrt. Bitte wende dich an den Support.");
    this.name = "GeminiAccessBlockedError";
  }
}

// ─── Typen ────────────────────────────────────────────────────────────────────

/** Ein einzelner Inhaltsteil, den Gemini als Eingabe akzeptiert. */
export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/**
 * Welche App-Funktion die Anfrage auslöst — landet in ai_logs.feature und
 * erscheint im Admin-Panel in der Nutzung pro User.
 */
export type AiFeature =
  | "food_photo"
  | "food_text"
  | "nutrition_fallback"
  | "training_plan"
  | "exercise_detail"
  | "unknown";

interface ProxyErrorBody {
  error?: string;
  code?: string;
  quota?: { daily_limit?: number | null; monthly_limit?: number | null };
}

function toLimitError(body: ProxyErrorBody): Error | null {
  switch (body.code) {
    case "daily_limit":
      return new GeminiDailyLimitError(body.quota?.daily_limit ?? DEFAULT_DAILY_REQUEST_LIMIT);
    case "monthly_limit":
      return new GeminiMonthlyLimitError(body.quota?.monthly_limit);
    case "monthly_cost_cap":
      return new GeminiCostLimitError();
    case "blocked":
      return new GeminiAccessBlockedError();
    default:
      return null;
  }
}

// ─── Core-Request ─────────────────────────────────────────────────────────────

export async function geminiRequest(
  parts: GeminiPart[],
  feature: AiFeature = "unknown",
): Promise<string> {
  console.log("[Gemini] Call gestartet", {
    feature,
    parts: parts.length,
    hasImage: parts.some((p) => "inline_data" in p),
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Bitte melde dich an, um die KI-Funktionen zu nutzen.");
  }

  const res = await fetch(proxyUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
    body: JSON.stringify({ parts, feature }),
  });

  let body: (ProxyErrorBody & { text?: string }) | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body?.text) {
    const limitError = body ? toLimitError(body) : null;
    if (limitError) throw limitError;
    const message = body?.error ?? `KI-Anfrage fehlgeschlagen (${res.status})`;
    console.error("[Gemini] Request fehlgeschlagen:", message);
    throw new Error(message);
  }

  return body.text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
}
