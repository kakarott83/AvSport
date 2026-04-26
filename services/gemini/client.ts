/**
 * services/gemini/client.ts
 *
 * Privater HTTP-Client für die Gemini API.
 * Wird nur innerhalb von services/gemini/ verwendet — nicht direkt importieren.
 */

import { supabase } from '@/services/supabaseClient';

// ─── Konfiguration ────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

function resolveApiKey(): string {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!key) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY ist nicht gesetzt');
  return key;
}

// ─── Typen ────────────────────────────────────────────────────────────────────

/** Ein einzelner Inhaltsteil, den Gemini als Eingabe akzeptiert. */
export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** Token-Nutzung aus Geminis usageMetadata-Feld. */
interface UsageMetadata {
  promptTokenCount?:     number;
  candidatesTokenCount?: number;
  totalTokenCount?:      number;
}

interface LogData {
  user_id:           string | null;
  model:             string;
  status:            'success' | 'error';
  prompt_tokens:     number | null;
  completion_tokens: number | null;
  total_tokens:      number | null;
  error_message:     string | null;
}

// ─── DB-Logging ───────────────────────────────────────────────────────────────

async function persistLog(
  status:       'success' | 'error',
  usage:        UsageMetadata | null,
  errorMessage: string | null,
): Promise<void> {
  // User-ID ermitteln (schlägt still fehl wenn nicht eingeloggt)
  let userId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch (authErr) {
    console.warn('[Gemini] Auth-Fehler beim Logging:', authErr);
  }

  const logData: LogData = {
    user_id:           userId,
    model:             GEMINI_MODEL,
    status,
    prompt_tokens:     usage?.promptTokenCount      ?? null,
    completion_tokens: usage?.candidatesTokenCount  ?? null,
    total_tokens:      usage?.totalTokenCount        ?? null,
    error_message:     errorMessage,
  };

  console.log('[Gemini] Versuche in ai_logs zu speichern...', logData);

  try {
    const { error } = await supabase.from('ai_logs').insert(logData);
    if (error) {
      console.error('[Gemini] Supabase Log-Fehler:', error);
    }
  } catch (dbErr) {
    console.error('[Gemini] Supabase Log-Fehler (Exception):', dbErr);
  }
}

// ─── Core-Request ─────────────────────────────────────────────────────────────

export async function geminiRequest(parts: GeminiPart[]): Promise<string> {
  console.log('[Gemini] Call gestartet', {
    model: GEMINI_MODEL,
    parts: parts.length,
    hasImage: parts.some((p) => 'inline_data' in p),
    supabaseReady: !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  });

  let usage: UsageMetadata | null = null;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${resolveApiKey()}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${body}`);
    }

    const json = await res.json();
    usage = (json?.usageMetadata as UsageMetadata) ?? null;

    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!raw) throw new Error('Gemini: leere Antwort');

    console.log('[Gemini] Antwort erhalten — Tokens:', {
      prompt:     usage?.promptTokenCount      ?? '–',
      completion: usage?.candidatesTokenCount  ?? '–',
      total:      usage?.totalTokenCount        ?? '–',
    });

    void persistLog('success', usage, null);

    return raw
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Gemini] Request fehlgeschlagen:', message);
    void persistLog('error', usage, message);
    throw err;
  }
}
