/**
 * supabase/functions/ai-proxy
 *
 * Einziger Weg der App zu Gemini. Der Gemini-API-Key liegt nur noch hier
 * (Secret GEMINI_API_KEY), nicht mehr im App-Bundle — dadurch lassen sich die
 * Nutzungs-Limits nicht mehr am Client vorbei umgehen.
 *
 * Ablauf pro Request:
 *   1. User-JWT prüfen (401 ohne Login, 403 bei gesperrtem Account).
 *   2. public.ai_quota_status(user) → 403 'blocked' / 429 'daily_limit' |
 *      'monthly_limit' | 'monthly_cost_cap' (Limits steuerbar im Admin-Panel,
 *      siehe Migration 20261017130000_ai_usage_limits.sql).
 *   3. Gemini aufrufen, Ergebnis + Tokens + Kosten in ai_logs schreiben.
 *
 * Body:
 *   { action?: 'generate', parts: GeminiPart[], feature?: string }
 *     → { ok: true, text, usage }
 *   { action: 'quota' }
 *     → { ok: true, quota }   (aktueller Verbrauch + Limits, z. B. für die UI)
 *
 * Secrets: GEMINI_API_KEY (Pflicht), GEMINI_MODEL (optional,
 * Default gemini-2.5-flash). SUPABASE_URL / SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY injiziert Supabase automatisch.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { estimateCostUsd, quotaRejection, sanitizeFeature, validateParts, type UsageMetadata } from './request.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const LIMIT_MESSAGES: Record<string, string> = {
  blocked: 'Dein Zugang zu den KI-Funktionen ist derzeit gesperrt.',
  daily_limit: 'Tageslimit für KI-Anfragen erreicht.',
  monthly_limit: 'Monatslimit für KI-Anfragen erreicht.',
  monthly_cost_cap: 'Monatliches KI-Kostenlimit erreicht.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY ist nicht gesetzt.' }, 500);

  // 1) Wer ruft an?
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Nicht angemeldet.', code: 'unauthenticated' }, 401);
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    return json({ error: LIMIT_MESSAGES.blocked, code: 'blocked' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültiger Request-Body.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // 2) Limits prüfen — schlägt die Prüfung fehl, wird abgelehnt (fail closed),
  //    damit ein DB-Problem nie zu unbegrenzten Kosten führt.
  const { data: quota, error: quotaErr } = await admin.rpc('ai_quota_status', { p_user_id: user.id });
  if (quotaErr || !quota) {
    console.error('[ai-proxy] Quota-Check fehlgeschlagen:', quotaErr);
    return json({ error: 'Limit-Prüfung fehlgeschlagen, bitte später erneut versuchen.' }, 503);
  }

  if (body.action === 'quota') return json({ ok: true, quota });

  const rejection = quotaRejection(quota.reason);
  if (rejection) {
    return json(
      {
        error: LIMIT_MESSAGES[rejection.code] ?? 'Limit erreicht.',
        code: rejection.code,
        quota,
      },
      rejection.status,
    );
  }

  const validated = validateParts(body.parts);
  if ('error' in validated) return json({ error: validated.error }, 400);
  const feature = sanitizeFeature(body.feature);

  // 3) Gemini aufrufen + loggen
  let usage: UsageMetadata | null = null;
  const log = (status: 'success' | 'error', errorMessage: string | null) =>
    admin.from('ai_logs').insert({
      user_id: user.id,
      model: GEMINI_MODEL,
      status,
      feature,
      prompt_tokens: usage?.promptTokenCount ?? null,
      completion_tokens: usage?.candidatesTokenCount ?? null,
      total_tokens: usage?.totalTokenCount ?? null,
      error_message: errorMessage,
      cost_usd: estimateCostUsd(usage),
    });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({ contents: [{ parts: validated.parts }] }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${text.slice(0, 500)}`);
    }
    const result = await res.json();
    usage = (result?.usageMetadata as UsageMetadata) ?? null;
    const text: string = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('Gemini: leere Antwort');

    const { error: logErr } = await log('success', null);
    if (logErr) console.error('[ai-proxy] ai_logs-Insert fehlgeschlagen:', logErr);

    return json({ ok: true, text, usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai-proxy] Gemini-Fehler:', message);
    await log('error', message);
    return json({ error: 'KI-Anfrage fehlgeschlagen.', code: 'upstream_error' }, 502);
  }
});
