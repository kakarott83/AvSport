/**
 * supabase/functions/admin-api
 *
 * Backend für das externe Admin-Panel (admin-site/, z. B. auf Strato gehostet).
 * Einziger Einstiegspunkt für alle Admin-Aktionen — der service_role-Key
 * verlässt nie diese Function, das Admin-Panel selbst kennt nur den
 * öffentlichen anon-Key (zum Einloggen).
 *
 * Ablauf pro Request:
 *   1. Authorization-Header (User-JWT aus dem Supabase-Login im Admin-Panel)
 *      wird gegen den anon-Key geprüft → liefert die User-ID.
 *   2. User-ID wird gegen public.admins geprüft (siehe Migration
 *      20260914190801_admin_panel.sql) → kein Eintrag = 403.
 *   3. Erst danach wird die passende admin_*()-RPC mit dem service_role-Client
 *      aufgerufen. Diese RPCs sind selbst zusätzlich per REVOKE/GRANT nur für
 *      service_role ausführbar — doppelt abgesichert.
 *
 * Body: { action: string, ...params } — siehe switch unten.
 *
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY werden von
 * Supabase automatisch injiziert.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  // 1) Wer ruft an? (User-JWT aus dem Login im Admin-Panel)
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Nicht angemeldet.' }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  // 2) Ist diese User-ID als Admin gelistet?
  const { data: adminRow, error: adminErr } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminErr) return json({ error: 'Admin-Check fehlgeschlagen: ' + adminErr.message }, 500);
  if (!adminRow) return json({ error: 'Kein Admin-Zugriff.' }, 403);

  // 3) Aktion ausführen
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültiger Request-Body.' }, 400);
  }

  switch (body.action) {
    case 'metrics': {
      const { data, error } = await admin.rpc('admin_get_dashboard');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, data });
    }

    case 'list_feedback': {
      const { data, error } = await admin.rpc('admin_list_feedback', {
        only_unhandled: body.onlyUnhandled === true,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, data });
    }

    case 'set_feedback_handled': {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'id fehlt.' }, 400);
      const { error } = await admin.rpc('admin_set_feedback_handled', {
        feedback_id: id,
        is_handled: body.handled === true,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    case 'list_users': {
      const { data, error } = await admin.rpc('admin_list_users');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, data });
    }

    case 'set_premium': {
      const userId = String(body.userId ?? '');
      if (!userId) return json({ error: 'userId fehlt.' }, 400);
      const { error } = await admin.rpc('admin_set_premium', {
        target_user_id: userId,
        make_premium: body.isPremium === true,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: 'Unbekannte Aktion: ' + String(body.action) }, 400);
  }
});
