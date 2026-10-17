/**
 * supabase/functions/send-feedback
 *
 * Nimmt Nutzer-Feedback entgegen, speichert es IMMER in public.feedback und
 * schickt es zusätzlich best-effort per E-Mail an das Support-Postfach.
 * Schlägt der Mailversand fehl, ist das Feedback trotzdem gespeichert –
 * der Client bekommt `{ ok: true, emailed: false }`.
 *
 * Versand über SMTP (z. B. Strato), sonst Resend, sonst nur Speichern.
 *
 * SMTP-Secrets (bevorzugt):
 *   SMTP_USER        – Postfach-Login, z. B. support@milan-muc.de
 *   SMTP_PASS        – Postfach-Passwort
 *   SMTP_HOST        – Default: smtp.strato.de
 *   SMTP_PORT        – Default: 465 (SSL). Achtung: 25 und 587 sind in
 *                      Supabase Edge Functions gesperrt.
 * Alternativ:
 *   RESEND_API_KEY   – API-Key von https://resend.com
 * Optionale Secrets:
 *   FEEDBACK_TO      – Zieladresse (Default: support@milan-muc.de)
 *   FEEDBACK_FROM    – Absender. SMTP: Default "AvoraSport Feedback <SMTP_USER>"
 *                      (Strato erlaubt nur das eigene Postfach bzw. Aliase);
 *                      Resend: Domain muss verifiziert sein
 *                      (Default: "AvoraSport Feedback <onboarding@resend.dev>")
 *
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY werden von
 * Supabase automatisch injiziert.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.strato.de';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FEEDBACK_TO = Deno.env.get('FEEDBACK_TO') ?? 'support@milan-muc.de';
const FEEDBACK_FROM =
  Deno.env.get('FEEDBACK_FROM') ??
  (SMTP_USER ? `AvoraSport Feedback <${SMTP_USER}>` : 'AvoraSport Feedback <onboarding@resend.dev>');

interface Mail {
  subject: string;
  text: string;
  replyTo?: string;
}

/** SMTP (SSL auf 465) — z. B. Strato. */
async function sendViaSmtp(mail: Mail): Promise<boolean> {
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: FEEDBACK_FROM,
    to: FEEDBACK_TO,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
  });
  return true;
}

async function sendViaResend(mail: Mail): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FEEDBACK_FROM,
      to: [FEEDBACK_TO],
      reply_to: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!res.ok) console.error('[send-feedback] Resend', res.status, await res.text());
  return res.ok;
}

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
  const mail: Mail = {
    subject: `[AvoraSport] ${subject}`,
    replyTo: user.email ?? undefined,
    text:
      `Neues App-Feedback\n\n` +
      `Von:        ${user.email ?? 'unbekannt'}\n` +
      `User-ID:    ${user.id}\n` +
      `Plattform:  ${platform ?? '?'}   App-Version: ${appVersion ?? '?'}\n` +
      `Zeit:       ${new Date().toISOString()}\n` +
      `Feedback-ID: ${row.id}\n\n` +
      `--- Nachricht ---\n${message}\n`,
  };
  try {
    if (SMTP_USER && SMTP_PASS) emailed = await sendViaSmtp(mail);
    else if (RESEND_API_KEY) emailed = await sendViaResend(mail);
  } catch (err) {
    console.error('[send-feedback] Mailversand fehlgeschlagen', err);
  }
  if (emailed) {
    await admin.from('feedback').update({ emailed: true }).eq('id', row.id);
  }

  return json({ ok: true, emailed });
});
