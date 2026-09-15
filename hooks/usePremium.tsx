/**
 * hooks/usePremium.tsx
 *
 * Stellt den Premium-Status (RevenueCat-Entitlement `premium`) app-weit bereit.
 * Quelle der Wahrheit fürs UI ist `CustomerInfo` aus dem SDK; der Status
 * aktualisiert sich per Listener sofort nach Kauf/Renewal/Ablauf.
 *
 * Der Server (services/gemini/client.ts) nutzt zusätzlich `profiles.is_premium`,
 * das vom RevenueCat-Webhook gesetzt wird — hier nicht nötig.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { addPremiumListener, getActivePlanLabel, getPremiumStatus, isPurchasesConfigured } from '@/lib/purchases';

interface PremiumContextValue {
  isPremium: boolean;
  loading: boolean;
  /** Anzeige-Label des aktiven Pakets, z. B. "Monatlich · 4,99 € / Monat". `null` solange nicht Premium oder (noch) unbekannt. */
  planLabel: string | null;
  /** Status neu vom SDK abfragen (z. B. nach „Käufe wiederherstellen"). */
  refresh: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextValue>({
  isPremium: false,
  loading: true,
  planLabel: null,
  refresh: async () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const premium = await getPremiumStatus();
    setIsPremium(premium);
    setPlanLabel(premium ? await getActivePlanLabel() : null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isPurchasesConfigured()) {
      setLoading(false);
      return;
    }

    refresh().finally(() => { if (!cancelled) setLoading(false); });

    const unsubscribe = addPremiumListener((v) => {
      if (cancelled) return;
      setIsPremium(v);
      if (v) {
        void getActivePlanLabel().then((label) => { if (!cancelled) setPlanLabel(label); });
      } else {
        setPlanLabel(null);
      }
    });

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const value = useMemo(
    () => ({ isPremium, planLabel, loading, refresh }),
    [isPremium, planLabel, loading, refresh],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}
