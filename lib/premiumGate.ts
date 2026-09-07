/**
 * lib/premiumGate.ts
 *
 * Kleine Helfer für die „weiche" Bezahlschranke: Free-User dürfen die
 * KI-Features nutzen, bis das Tageslimit (services/gemini/client.ts) greift —
 * dann wird statt einer Fehlermeldung die Paywall gezeigt.
 */

import type { Router } from 'expo-router';

import { GeminiDailyLimitError } from '@/services/gemini/client';

export const PAYWALL_ROUTE = '/paywall' as const;

/** War der Fehler das erreichte KI-Tageslimit? */
export function isDailyLimitError(err: unknown): boolean {
  return (
    err instanceof GeminiDailyLimitError ||
    (err as { name?: string })?.name === 'GeminiDailyLimitError'
  );
}

/** Paywall öffnen (Modal). */
export function openPaywall(router: Router): void {
  router.push(PAYWALL_ROUTE);
}
