/**
 * supabase/functions/admin-api
 *
 * Backend für das externe Admin-Panel (admin-site/, gehostet auf milan-muc.de).
 * Einziger Einstiegspunkt für alle Admin-Aktionen — der service_role-Key
 * verlässt nie diese Function, das Admin-Panel selbst kennt nur den
 * öffentlichen anon-Key (zum Einloggen).
 *
 * Ablauf pro Request:
 *   1. Origin-Header gegen ADMIN_ALLOWED_ORIGINS prüfen (CORS).
 *   2. Authorization-Header (User-JWT aus dem Supabase-Login im Admin-Panel)
 *      wird gegen den anon-Key geprüft → liefert die User-ID.
 *   3. Zwei-Faktor-Login (aal2) verlangen, solange ADMIN_REQUIRE_MFA nicht
 *      "false" ist → sonst 403 { code: 'mfa_required' }.
 *   4. User-ID wird gegen public.admins geprüft (siehe Migration
 *      20260914190801_admin_panel.sql) → kein Eintrag = 403.
 *   5. Erst danach wird die passende admin_*()-RPC mit dem service_role-Client
 *      aufgerufen. Diese RPCs sind selbst zusätzlich per REVOKE/GRANT nur für
 *      service_role ausführbar — doppelt abgesichert. Ändernde Aktionen landen
 *      in public.admin_audit_log.
 *
 * Body: { action: string, ...params } — siehe switch unten.
 *
 * Secrets (optional):
 *   ADMIN_ALLOWED_ORIGINS – kommagetrennt, Default: https://milan-muc.de,
 *                           https://www.milan-muc.de, https://admin.milan-muc.de
 *   ADMIN_REQUIRE_MFA     – "false" schaltet die 2FA-Pflicht ab (Default: an)
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY werden von
 * Supabase automatisch injiziert.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { isOriginAllowed, isUuid, parseAllowedOrigins, parseOptionalLimit, readAal } from './security.ts';

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ADMIN_ALLOWED_ORIGINS'));
const REQUIRE_MFA = Deno.env.get('ADMIN_REQUIRE_MFA') !== 'false';

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && isOriginAllowed(origin, ALLOWED_ORIGINS)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cors = corsHeaders(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (!isOriginAllowed(origin, ALLOWED_ORIGINS)) return json({ error: 'Origin nicht erlaubt.' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
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
  if (userErr || !user) return json({ error: 'Nicht angemeldet.', code: 'unauthenticated' }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  // 2) Ist diese User-ID als Admin gelistet?
  const { data: adminRow, error: adminErr } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminErr) return json({ error: 'Admin-Check fehlgeschlagen: ' + adminErr.message }, 500);
  if (!adminRow) return json({ error: 'Kein Admin-Zugriff.', code: 'not_admin' }, 403);

  // 3) Zwei-Faktor-Login verlangen
  if (REQUIRE_MFA && readAal(authHeader) !== 'aal2') {
    return json({ error: 'Zwei-Faktor-Anmeldung erforderlich.', code: 'mfa_required' }, 403);
  }

  // 4) Aktion ausführen
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültiger Request-Body.' }, 400);
  }

  const audit = async (action: string, targetUserId: string | null, details: Record<string, unknown>) => {
    const { error } = await admin.rpc('admin_log_action', {
      p_admin_id: user.id,
      p_admin_email: user.email ?? null,
      p_action: action,
      p_target_user_id: targetUserId,
      p_details: details,
    });
    if (error) console.error('[admin-api] Audit-Log fehlgeschlagen:', error);
  };

  /** Ruft eine RPC auf und liefert { ok, data } bzw. einen 500er. */
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { response: json({ error: error.message }, 500) };
    return { data };
  };

  const targetUserId = body.userId;

  switch (body.action) {
    case 'whoami':
      return json({ ok: true, data: { email: user.email, mfaRequired: REQUIRE_MFA } });

    case 'metrics': {
      const r = await rpc('admin_get_dashboard');
      return r.response ?? json({ ok: true, data: r.data });
    }

    case 'list_feedback': {
      const r = await rpc('admin_list_feedback', { only_unhandled: body.onlyUnhandled === true });
      return r.response ?? json({ ok: true, data: r.data });
    }

    case 'set_feedback_handled': {
      if (!isUuid(body.id)) return json({ error: 'id fehlt.' }, 400);
      const r = await rpc('admin_set_feedback_handled', { feedback_id: body.id, is_handled: body.handled === true });
      return r.response ?? json({ ok: true });
    }

    case 'list_users': {
      const r = await rpc('admin_list_users');
      return r.response ?? json({ ok: true, data: r.data });
    }

    case 'list_usage': {
      const r = await rpc('admin_list_user_usage');
      return r.response ?? json({ ok: true, data: r.data });
    }

    case 'user_detail': {
      if (!isUuid(targetUserId)) return json({ error: 'userId fehlt.' }, 400);
      const r = await rpc('admin_get_user_usage', { p_user_id: targetUserId });
      return r.response ?? json({ ok: true, data: r.data });
    }

    case 'set_premium': {
      if (!isUuid(targetUserId)) return json({ error: 'userId fehlt.' }, 400);
      const r = await rpc('admin_set_premium', { target_user_id: targetUserId, make_premium: body.isPremium === true });
      if (r.response) return r.response;
      await audit('set_premium', targetUserId, { isPremium: body.isPremium === true });
      return json({ ok: true });
    }

    case 'set_limits': {
      if (!isUuid(targetUserId)) return json({ error: 'userId fehlt.' }, 400);
      const daily = parseOptionalLimit(body.dailyRequestLimit, { integer: true });
      const monthly = parseOptionalLimit(body.monthlyRequestLimit, { integer: true });
      const cost = parseOptionalLimit(body.monthlyCostCapUsd, { integer: false });
      if (!daily.ok || !monthly.ok || !cost.ok) return json({ error: 'Ungültiger Limit-Wert.' }, 400);
      const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
      const details = {
        dailyRequestLimit: daily.value,
        monthlyRequestLimit: monthly.value,
        monthlyCostCapUsd: cost.value,
        unlimited: body.unlimited === true,
        note,
      };
      const r = await rpc('admin_set_user_limits', {
        p_user_id: targetUserId,
        p_daily_request_limit: daily.value,
        p_monthly_request_limit: monthly.value,
        p_monthly_cost_cap_usd: cost.value,
        p_unlimited: body.unlimited === true,
        p_note: note,
        p_admin_id: user.id,
      });
      if (r.response) return r.response;
      await audit('set_limits', targetUserId, details);
      return json({ ok: true });
    }

    case 'set_ai_blocked': {
      if (!isUuid(targetUserId)) return json({ error: 'userId fehlt.' }, 400);
      const blocked = body.blocked === true;
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;
      const r = await rpc('admin_set_ai_blocked', {
        p_user_id: targetUserId,
        p_blocked: blocked,
        p_reason: reason,
        p_admin_id: user.id,
      });
      if (r.response) return r.response;
      await audit(blocked ? 'block_ai' : 'unblock_ai', targetUserId, { reason });
      return json({ ok: true });
    }

    case 'reset_usage': {
      if (!isUuid(targetUserId)) return json({ error: 'userId fehlt.' }, 400);
      const r = await rpc('admin_reset_user_usage', { p_user_id: targetUserId, p_admin_id: user.id });
      if (r.response) return r.response;
      await audit('reset_usage', targetUserId, {});
      return json({ ok: true });
    }

    case 'set_account_banned': {
      if (!isUuid(targetUserId)) return json({ error: 'userId fehlt.' }, 400);
      if (targetUserId === user.id) return json({ error: 'Du kannst deinen eigenen Account nicht sperren.' }, 400);
      const banned = body.banned === true;
      // 876000h ≈ 100 Jahre = dauerhaft. Gesperrte Accounts können sich nicht
      // mehr anmelden und keine Tokens erneuern; ai-proxy lehnt sie zusätzlich ab.
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: banned ? '876000h' : 'none',
      });
      if (error) return json({ error: error.message }, 500);
      await audit(banned ? 'ban_account' : 'unban_account', targetUserId, {});
      return json({ ok: true });
    }

    case 'get_defaults': {
      const r = await rpc('admin_get_limit_defaults');
      return r.response ?? json({ ok: true, data: r.data });
    }

    case 'set_defaults': {
      if (body.tier !== 'free' && body.tier !== 'premium') return json({ error: 'tier muss free oder premium sein.' }, 400);
      const daily = parseOptionalLimit(body.dailyRequestLimit, { integer: true });
      const monthly = parseOptionalLimit(body.monthlyRequestLimit, { integer: true });
      const cost = parseOptionalLimit(body.monthlyCostCapUsd, { integer: false });
      if (!daily.ok || !monthly.ok || !cost.ok) return json({ error: 'Ungültiger Limit-Wert.' }, 400);
      const r = await rpc('admin_set_limit_defaults', {
        p_tier: body.tier,
        p_daily_request_limit: daily.value,
        p_monthly_request_limit: monthly.value,
        p_monthly_cost_cap_usd: cost.value,
      });
      if (r.response) return r.response;
      await audit('set_defaults', null, {
        tier: body.tier,
        dailyRequestLimit: daily.value,
        monthlyRequestLimit: monthly.value,
        monthlyCostCapUsd: cost.value,
      });
      return json({ ok: true });
    }

    case 'list_audit': {
      const r = await rpc('admin_list_audit', { p_limit: 300 });
      return r.response ?? json({ ok: true, data: r.data });
    }

    default:
      return json({ error: 'Unbekannte Aktion: ' + String(body.action) }, 400);
  }
});
