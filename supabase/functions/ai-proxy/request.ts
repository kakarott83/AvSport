/**
 * Reine Hilfsfunktionen für supabase/functions/ai-proxy (ohne Deno-/Netzwerk-
 * Abhängigkeiten, damit sie mit Jest testbar sind).
 */

/** USD-Preise pro 1M Tokens für gemini-2.5-flash (Stand: 09/2026). */
export const PRICE_PER_1M_INPUT_TOKENS_USD = 0.3;
export const PRICE_PER_1M_OUTPUT_TOKENS_USD = 2.5;

const MAX_PARTS = 6;
const MAX_TEXT_CHARS = 60_000;
/** ~7,5 MB Base64 pro Bild — reicht für zwei komprimierte Kamera-Fotos. */
const MAX_INLINE_DATA_CHARS = 10_000_000;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export function estimateCostUsd(usage: UsageMetadata | null | undefined): number {
  if (!usage) return 0;
  const input = ((usage.promptTokenCount ?? 0) / 1_000_000) * PRICE_PER_1M_INPUT_TOKENS_USD;
  const output = ((usage.candidatesTokenCount ?? 0) / 1_000_000) * PRICE_PER_1M_OUTPUT_TOKENS_USD;
  return input + output;
}

/** Normalisiert das feature-Tag aus dem Client (nur a-z, 0-9, _). */
export function sanitizeFeature(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9_]{1,40}$/.test(value) ? value : 'unknown';
}

/** Prüft die vom Client geschickten Gemini-Parts. Liefert Parts oder eine Fehlermeldung. */
export function validateParts(value: unknown): { parts: GeminiPart[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: 'parts fehlt.' };
  if (value.length > MAX_PARTS) return { error: `Maximal ${MAX_PARTS} parts erlaubt.` };

  const parts: GeminiPart[] = [];
  for (const raw of value) {
    const p = raw as Record<string, unknown>;
    if (typeof p?.text === 'string') {
      if (p.text.length > MAX_TEXT_CHARS) return { error: 'Text zu lang.' };
      parts.push({ text: p.text });
      continue;
    }
    const inline = p?.inline_data as Record<string, unknown> | undefined;
    if (inline && typeof inline.mime_type === 'string' && typeof inline.data === 'string') {
      if (!ALLOWED_MIME_TYPES.has(inline.mime_type)) return { error: 'Bildformat nicht erlaubt.' };
      if (inline.data.length > MAX_INLINE_DATA_CHARS) return { error: 'Bild zu groß.' };
      parts.push({ inline_data: { mime_type: inline.mime_type, data: inline.data } });
      continue;
    }
    return { error: 'Ungültiger part.' };
  }
  return { parts };
}

/** HTTP-Status + Fehlercode, wenn ai_quota_status() die Anfrage ablehnt. */
export function quotaRejection(reason: string | null | undefined): { status: number; code: string } | null {
  switch (reason) {
    case null:
    case undefined:
      return null;
    case 'blocked':
      return { status: 403, code: 'blocked' };
    case 'daily_limit':
    case 'monthly_limit':
    case 'monthly_cost_cap':
      return { status: 429, code: reason };
    default:
      return { status: 429, code: 'limit' };
  }
}
