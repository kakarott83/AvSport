/**
 * supabase/functions/send-feedback
 *
 * Nimmt Nutzer-Feedback entgegen, speichert es IMMER in public.feedback und
 * schickt es zusätzlich best-effort per E-Mail an das Support-Postfach
 * (über Resend). Schlägt der Mailversand fehl, ist das Feedback trotzdem
 * gespeichert – der Client bekommt `{ ok: true, emailed: false }`.
 *
 * Erforderliche Secrets:
 *   RESEND_API_KEY   – API-Key von https://resend.com  (sonst wird nur gespeichert)
 * Optionale Secrets:
 *   FEEDBACK_TO      – Zieladresse (Default: support@milan.mus.de)
 *   FEEDBACK_FROM    – Absender, Domain muss in Resend verifiziert sein
 *                      (Default: "AvoraSport Feedback <onboarding@resend.dev>")
 *
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY werden von
 * Supabase automatisch injiziert.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FEEDBACK_TO = Deno.env.get('FEEDBACK_TO') ?? 'support@milan.mus.de';
const FEEDBACK_FROM = Deno.env.get('FEEDBACK_FROM') ?? 'AvoraSport Feedback <onboarding@resend.dev>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Nutzer aus dem mitgeschickten JWT ermitteln
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Nicht angemeldet.' }, 401);

  let payload: {
    subject?: unknown;
    message?: unknown;
    appVersion?: unknown;
    platform?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Ungültiger Request-Body.' }, 400);
  }

  const subject = String(payload.subject ?? '').trim().slice(0, 200) || '(kein Betreff)';
  const message = String(payload.message ?? '').trim();
  const appVersion = payload.appVersion ? String(payload.appVersion).slice(0, 40) : null;
  const platform = payload.platform ? String(payload.platform).slice(0, 20) : null;

  if (!message) return json({ error: 'Bitte gib dein Feedback ein.' }, 400);
  if (message.length > 5000) return json({ error: 'Feedback ist zu lang (max. 5000 Zeichen).' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // 1) Immer speichern
  const { data: row, error: insErr } = await admin
    .from('feedback')
    .insert({
      user_id: user.id,
      email: user.email ?? null,
      subject,
      message,
      app_version: appVersion,
      platform,
    })
    .select('id')
    .single();

  if (insErr) return json({ error: 'Speichern fehlgeschlagen: ' + insErr.message }, 500);

  // 2) E-Mail (best effort)
  let emailed = false;
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FEEDBACK_FROM,
          to: [FEEDBACK_TO],
          reply_to: user.email ?? undefined,
          subject: `[AvoraSport] ${subject}`,
          text:
            `Neues App-Feedback\n\n` +
            `Von:        ${user.email ?? 'unbekannt'}\n` +
            `User-ID:    ${user.id}\n` +
            `Plattform:  ${platform ?? '?'}   App-Version: ${appVersion ?? '?'}\n` +
            `Zeit:       ${new Date().toISOString()}\n` +
            `Feedback-ID: ${row.id}\n\n` +
            `--- Nachricht ---\n${message}\n`,
        }),
      });
      emailed = res.ok;
      if (res.ok) {
        await admin.from('feedback').update({ emailed: true }).eq('id', row.id);
      } else {
        console.error('[send-feedback] Resend', res.status, await res.text());
      }
    } catch (err) {
      console.error('[send-feedback] Resend fetch failed', err);
    }
  }

  return json({ ok: true, emailed });
});
