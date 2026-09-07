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

/** Maximale Anzahl Gemini-Anfragen pro User und Tag. */
const DAILY_REQUEST_LIMIT = 10;
const UNLIMITED_PROMPT_EMAILS = new Set(["av@test.de"]);

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

/** Wirft GeminiDailyLimitError, wenn der User heute bereits DAILY_REQUEST_LIMIT Anfragen gemacht hat. */
async function assertUnderDailyLimit(
  userId: string,
  email?: string | null,
  isPremium = false,
): Promise<void> {
  // Premium-Abonnenten (RevenueCat) und die Allowlist haben kein Tageslimit.
  if (isPremium || isUnlimitedPromptUser(email)) {
    return;
  }

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
    await assertUnderDailyLimit(currentUser.id, currentUser.email, currentUser.isPremium);
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
