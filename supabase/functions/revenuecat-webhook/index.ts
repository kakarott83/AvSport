/**
 * supabase/functions/revenuecat-webhook
 *
 * Empfängt RevenueCat-Webhook-Events und spiegelt den Premium-Status in
 * public.profiles (is_premium / premium_until / premium_product). Damit kann
 * der Server (services/gemini/client.ts) das KI-Tageslimit für Abonnenten
 * überspringen, unabhängig vom Client.
 *
 * Auth: RevenueCat schickt den im Dashboard konfigurierten Wert im
 *   `Authorization`-Header. Wir vergleichen ihn mit dem Secret
 *   REVENUECAT_WEBHOOK_AUTH. Ohne Übereinstimmung → 401.
 *
 * Erforderliche Secrets:
 *   REVENUECAT_WEBHOOK_AUTH   – frei wählbarer geheimer String, identisch im
 *                              RevenueCat-Dashboard (Integrations → Webhooks).
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY werden automatisch injiziert.
 *
 * Die Antwort ist absichtlich immer 200 (außer 401/405), damit RevenueCat
 * keine Retry-Schleife startet – Fehler werden nur geloggt.
 */

import { createClient } from '@supabase/supabase-js';

import { resolvePremiumState, type RevenueCatEvent } from './resolvePremium.ts';

const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!WEBHOOK_AUTH || req.headers.get('Authorization') !== WEBHOOK_AUTH) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let event: RevenueCatEvent | undefined;
  try {
    const payload = await req.json();
    event = payload?.event ?? payload;
  } catch {
    return json({ ok: true, ignored: 'invalid json' });
  }

  const state = resolvePremiumState(event);
  if (!state) return json({ ok: true, ignored: 'irrelevant event' });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase
      .from('profiles')
      .update({
        is_premium: state.isPremium,
        premium_until: state.premiumUntil,
        premium_product: state.premiumProduct,
      })
      .eq('id', state.userId);

    if (error) {
      console.error('[revenuecat-webhook] update fehlgeschlagen:', error.message);
      return json({ ok: false, error: error.message });
    }
  } catch (err) {
    console.error('[revenuecat-webhook] Ausnahme:', err);
    return json({ ok: false });
  }

  return json({ ok: true, userId: state.userId, isPremium: state.isPremium });
});
