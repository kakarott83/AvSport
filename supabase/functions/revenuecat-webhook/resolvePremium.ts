/**
 * Reine Auswertung eines RevenueCat-Webhook-Events → Premium-Status für
 * public.profiles. Bewusst importfrei, damit dieselbe Datei sowohl im Deno-
 * Edge-Runtime als auch im Jest-Test (resolvePremium.test.ts) läuft.
 *
 * Event-Doku: https://www.revenuecat.com/docs/webhooks/event-types-and-fields
 */

export interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  /** Ablaufzeitpunkt des (letzten) Entitlements in ms seit Epoch. */
  expiration_at_ms?: number | null;
}

export interface PremiumState {
  /** Supabase-User-ID (= RevenueCat app_user_id). */
  userId: string;
  isPremium: boolean;
  premiumUntil: string | null; // ISO
  premiumProduct: string | null;
}

/** Events, die (sofern nicht abgelaufen) Premium bedeuten. */
const GRANTING_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
]);

/** Events, die Premium sofort entziehen. */
const REVOKING_TYPES = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED', 'REFUND']);

/**
 * Leitet aus einem RevenueCat-Event den zu speichernden Premium-Status ab.
 * Gibt `null` zurück, wenn das Event keine User-ID trägt oder sein Typ für den
 * Premium-Status irrelevant ist (z. B. TRANSFER, BILLING_ISSUE).
 */
export function resolvePremiumState(
  event: RevenueCatEvent | null | undefined,
  now: number = Date.now(),
): PremiumState | null {
  if (!event) return null;

  const userId = (event.app_user_id ?? event.original_app_user_id ?? '').trim();
  if (!userId) return null;

  const type = (event.type ?? '').toUpperCase();
  const exp = typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;
  const notExpired = exp != null && exp > now;

  let isPremium: boolean;
  if (REVOKING_TYPES.has(type)) {
    isPremium = false;
  } else if (GRANTING_TYPES.has(type)) {
    // Nicht-Abos (NON_RENEWING_PURCHASE) haben kein Ablaufdatum → gewährt.
    isPremium = exp == null ? true : notExpired;
  } else if (type === 'CANCELLATION') {
    // Kündigung wirkt erst zum Periodenende: bis dahin bleibt Premium bestehen.
    isPremium = notExpired;
  } else {
    return null; // irrelevanter Event-Typ
  }

  return {
    userId,
    isPremium,
    premiumUntil: exp != null ? new Date(exp).toISOString() : null,
    premiumProduct: event.product_id?.trim() || null,
  };
}
