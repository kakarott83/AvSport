/**
 * services/gemini/client.ts
 *
 * Privater HTTP-Client für die Gemini API.
 * Wird nur innerhalb von services/gemini/ verwendet — nicht direkt importieren.
 */

import { supabase } from "@/services/supabaseClient";

// ─── Konfiguration ────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

/** Maximale Anzahl Gemini-Anfragen pro User und Tag (kostenlose Accounts). */
const DAILY_REQUEST_LIMIT = 10;
const UNLIMITED_PROMPT_EMAILS = new Set(["av@test.de"]);

/**
 * USD-Preise pro 1M Tokens für gemini-2.5-flash.
 * Quelle: https://ai.google.dev/gemini-api/docs/pricing (Stand: 09/2026).
 * Bei einem Modell- oder Preiswechsel hier nachziehen — betrifft sowohl die
 * Kostenschätzung in persistLog() als auch das Premium-Kostenlimit unten.
 */
const PRICE_PER_1M_INPUT_TOKENS_USD = 0.3; // Text/Bild/Video
const PRICE_PER_1M_OUTPUT_TOKENS_USD = 2.5; // inkl. Thinking-Tokens

/**
 * Monatliches KI-Kostenlimit für Premium-Abonnenten. Gemini rechnet in USD ab;
 * statt eines Live-Wechselkurses wird hier bewusst konservativ 1 EUR ≈ 1 USD
 * angenommen (EUR war zuletzt tendenziell mehr wert als USD) — das Limit
 * greift dadurch im Zweifel etwas zu früh statt zu spät, echte 10 € Kosten
 * werden also nie überschritten.
 */
const PREMIUM_MONTHLY_COST_CAP_EUR = 10;
const PREMIUM_MONTHLY_COST_CAP_USD = PREMIUM_MONTHLY_COST_CAP_EUR;

/**
 * Planungsannahme für die teuerste realistische Einzelanfrage — bewusst über
 * dem bisher in ai_logs beobachteten Maximum (~0,0166 $ für eine große
 * Trainingsplan-Generierung), damit auch künftig etwas größere Prompts/Bilder
 * die Garantie nicht unterlaufen.
 */
const WORST_CASE_COST_PER_REQUEST_USD = 0.02;

/**
 * Konservative Untergrenze, wie viele Anfragen ein Premium-User pro Monat
 * mindestens hat, bevor der Kosten-Deckel greift — für Paywall-Texte o. Ä.
 * Reale Nutzung liegt i. d. R. deutlich höher (Durchschnittskosten pro
 * Anfrage lagen zuletzt bei ~0,0017 $, also eher ~5.800 Anfragen/Monat).
 */
export function estimateMinMonthlyPremiumRequests(): number {
  return Math.floor(PREMIUM_MONTHLY_COST_CAP_USD / WORST_CASE_COST_PER_REQUEST_USD);
}

function isUnlimitedPromptUser(email?: string | null): boolean {
  return !!email && UNLIMITED_PROMPT_EMAILS.has(email.trim().toLowerCase());
}

function resolveApiKey(): string {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!key) throw new Error("EXPO_PUBLIC_GEMINI_API_KEY ist nicht gesetzt");
  return key;
}

/** Wird geworfen, wenn ein User sein tägliches Gemini-Anfragelimit erreicht hat. */
export class GeminiDailyLimitError extends Error {
  constructor() {
    super(
      `Du hast dein tägliches Limit von ${DAILY_REQUEST_LIMIT} KI-Anfragen erreicht. ` +
        "Bitte versuche es morgen erneut.",
    );
    this.name = "GeminiDailyLimitError";
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

// ─── Typen ────────────────────────────────────────────────────────────────────

/** Ein einzelner Inhaltsteil, den Gemini als Eingabe akzeptiert. */
export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** Token-Nutzung aus Geminis usageMetadata-Feld. */
interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface LogData {
  user_id: string | null;
  model: string;
  status: "success" | "error";
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  error_message: string | null;
  cost_usd: number;
}

/** Schätzt die USD-Kosten einer Anfrage aus der Token-Nutzung (siehe Preise oben). */
function estimateCostUsd(usage: UsageMetadata | null): number {
  if (!usage) return 0;
  const inputCost = ((usage.promptTokenCount ?? 0) / 1_000_000) * PRICE_PER_1M_INPUT_TOKENS_USD;
  const outputCost = ((usage.candidatesTokenCount ?? 0) / 1_000_000) * PRICE_PER_1M_OUTPUT_TOKENS_USD;
  return inputCost + outputCost;
}

// ─── Tageslimit ───────────────────────────────────────────────────────────────

async function getCurrentUser(): Promise<{
  id: string | null;
  email: string | null;
  isPremium: boolean;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { id: null, email: null, isPremium: false };

    // Premium-Status wird vom RevenueCat-Webhook in profiles.is_premium gesetzt
    // (supabase/functions/revenuecat-webhook). Fehlt die Spalte / schlägt die
    // Abfrage fehl, gilt der User als nicht-premium (Limit greift).
    let isPremium = false;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();
      isPremium = data?.is_premium === true;
    } catch (premiumErr) {
      console.warn("[Gemini] Premium-Check fehlgeschlagen:", premiumErr);
    }

    return { id: user.id, email: user.email ?? null, isPremium };
  } catch (authErr) {
    console.warn(
      "[Gemini] Auth-Fehler beim Ermitteln der User-Daten:",
      authErr,
    );
    return { id: null, email: null, isPremium: false };
  }
}

function startOfTodayIso(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function startOfMonthIso(): string {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** Wirft GeminiDailyLimitError, wenn der User heute bereits DAILY_REQUEST_LIMIT Anfragen gemacht hat. */
async function assertUnderDailyLimit(userId: string): Promise<void> {
  const { count, error } = await supabase
    .from("ai_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfTodayIso());

  if (error) {
    console.warn(
      "[Gemini] Limit-Check fehlgeschlagen, Anfrage wird zugelassen:",
      error,
    );
    return;
  }

  if ((count ?? 0) >= DAILY_REQUEST_LIMIT) {
    throw new GeminiDailyLimitError();
  }
}

/**
 * Wirft GeminiCostLimitError, wenn ein Premium-User diesen Kalendermonat
 * bereits PREMIUM_MONTHLY_COST_CAP_USD an geschätzten Gemini-Kosten
 * verursacht hat (Summe von ai_logs.cost_usd, siehe persistLog()).
 */
async function assertUnderMonthlyCostCap(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("ai_logs")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", startOfMonthIso());

  if (error) {
    console.warn(
      "[Gemini] Kosten-Limit-Check fehlgeschlagen, Anfrage wird zugelassen:",
      error,
    );
    return;
  }

  const totalUsd = (data ?? []).reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
  if (totalUsd >= PREMIUM_MONTHLY_COST_CAP_USD) {
    throw new GeminiCostLimitError();
  }
}

/**
 * Wählt die passende Limit-Prüfung für den aktuellen User: die interne
 * Test-Allowlist hat gar kein Limit, Premium-Abonnenten unterliegen dem
 * monatlichen Kosten-Deckel statt dem täglichen Anfragelimit für
 * kostenlose Accounts.
 */
async function assertWithinLimits(
  userId: string,
  email: string | null,
  isPremium: boolean,
): Promise<void> {
  if (isUnlimitedPromptUser(email)) return;
  if (isPremium) {
    await assertUnderMonthlyCostCap(userId);
    return;
  }
  await assertUnderDailyLimit(userId);
}

// ─── DB-Logging ───────────────────────────────────────────────────────────────

async function persistLog(
  userId: string | null,
  status: "success" | "error",
  usage: UsageMetadata | null,
  errorMessage: string | null,
): Promise<void> {
  const logData: LogData = {
    user_id: userId,
    model: GEMINI_MODEL,
    status,
    prompt_tokens: usage?.promptTokenCount ?? null,
    completion_tokens: usage?.candidatesTokenCount ?? null,
    total_tokens: usage?.totalTokenCount ?? null,
    error_message: errorMessage,
    cost_usd: estimateCostUsd(usage),
  };

  console.log("[Gemini] Versuche in ai_logs zu speichern...", logData);

  try {
    const { error } = await supabase.from("ai_logs").insert(logData);
    if (error) {
      console.error("[Gemini] Supabase Log-Fehler:", error);
    }
  } catch (dbErr) {
    console.error("[Gemini] Supabase Log-Fehler (Exception):", dbErr);
  }
}

// ─── Core-Request ─────────────────────────────────────────────────────────────

export async function geminiRequest(parts: GeminiPart[]): Promise<string> {
  console.log("[Gemini] Call gestartet", {
    model: GEMINI_MODEL,
    parts: parts.length,
    hasImage: parts.some((p) => "inline_data" in p),
    supabaseReady: !!(
      process.env.EXPO_PUBLIC_SUPABASE_URL &&
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    ),
  });

  const currentUser = await getCurrentUser();
  if (currentUser.id) {
    await assertWithinLimits(currentUser.id, currentUser.email, currentUser.isPremium);
  }

  let usage: UsageMetadata | null = null;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${resolveApiKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${body}`);
    }

    const json = await res.json();
    usage = (json?.usageMetadata as UsageMetadata) ?? null;

    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!raw) throw new Error("Gemini: leere Antwort");

    console.log("[Gemini] Antwort erhalten — Tokens:", {
      prompt: usage?.promptTokenCount ?? "–",
      completion: usage?.candidatesTokenCount ?? "–",
      total: usage?.totalTokenCount ?? "–",
    });

    void persistLog(currentUser.id, "success", usage, null);

    return raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Gemini] Request fehlgeschlagen:", message);
    void persistLog(currentUser.id, "error", usage, message);
    throw err;
  }
}
