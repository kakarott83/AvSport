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

import { addPremiumListener, getPremiumStatus, isPurchasesConfigured } from '@/lib/purchases';

interface PremiumContextValue {
  isPremium: boolean;
  loading: boolean;
  /** Status neu vom SDK abfragen (z. B. nach „Käufe wiederherstellen"). */
  refresh: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextValue>({
  isPremium: false,
  loading: true,
  refresh: async () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsPremium(await getPremiumStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isPurchasesConfigured()) {
      setLoading(false);
      return;
    }

    getPremiumStatus()
      .then((v) => { if (!cancelled) setIsPremium(v); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const unsubscribe = addPremiumListener((v) => {
      if (!cancelled) setIsPremium(v);
    });

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const value = useMemo(
    () => ({ isPremium, loading, refresh }),
    [isPremium, loading, refresh],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}
