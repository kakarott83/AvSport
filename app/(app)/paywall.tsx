/**
 * app/(app)/paywall.tsx — "AvoraSport Premium"
 *
 * Modal-Paywall. Rendert die aktuelle RevenueCat-Offering dynamisch (Monats-
 * und Jahrespaket), kauft per `purchasePackage` und schließt bei Erfolg.
 * Ohne konfigurierte RevenueCat-Keys erscheint ein "bald verfügbar"-Hinweis.
 *
 * Pflichtangaben für den App-Store-Review sind enthalten: Auto-Renew-Hinweis,
 * "Käufe wiederherstellen", Links zu Rechtlichem/Datenschutz.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { usePremium } from '@/hooks/usePremium';
import {
  getCurrentOffering, isPurchasesConfigured, purchasePackage, PurchaseCancelledError, restorePurchases,
} from '@/lib/purchases';

const C_BG = '#121212';
const C_CARD = '#1e1e1e';
const C_ACCENT = '#00E5FF';

const BENEFITS = [
  'Unbegrenzte KI-Trainingspläne',
  'Unbegrenzter Kalorien-Scanner',
  'Kein tägliches KI-Limit mehr',
  'Alle künftigen Premium-Funktionen',
];

function packageLabel(pkg: PurchasesPackage): { title: string; sub: string } {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return { title: 'Jährlich', sub: `${pkg.product.priceString} / Jahr` };
    case 'MONTHLY':
      return { title: 'Monatlich', sub: `${pkg.product.priceString} / Monat` };
    default:
      return { title: pkg.product.title || pkg.identifier, sub: pkg.product.priceString };
  }
}

export default function PaywallScreen() {
  const router = useRouter();
  const { isPremium, refresh } = usePremium();

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPremium) router.back();
  }, [isPremium]);

  useEffect(() => {
    let cancelled = false;
    getCurrentOffering()
      .then((o) => {
        if (cancelled) return;
        setOffering(o);
        // Jahresabo vorauswählen, sonst das erste Paket.
        const annual = o?.availablePackages.find((p) => p.packageType === 'ANNUAL');
        setSelected(annual?.identifier ?? o?.availablePackages[0]?.identifier ?? null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const packages = useMemo(
    () => offering?.availablePackages ?? [],
    [offering],
  );
  const selectedPkg = packages.find((p) => p.identifier === selected) ?? null;

  async function handlePurchase() {
    if (!selectedPkg || busy) return;
    setBusy(true);
    try {
      await purchasePackage(selectedPkg);
      await refresh();
      router.back();
    } catch (err) {
      if (!(err instanceof PurchaseCancelledError)) {
        Alert.alert('Kauf fehlgeschlagen', (err as Error)?.message ?? 'Bitte später erneut versuchen.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await restorePurchases();
      await refresh();
      if (ok) {
        router.back();
      } else {
        Alert.alert('Keine Käufe gefunden', 'Für dieses Konto ist kein aktives Abo hinterlegt.');
      }
    } catch {
      Alert.alert('Fehler', 'Käufe konnten nicht wiederhergestellt werden.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <MaterialIcons name="bolt" size={44} color={C_ACCENT} style={{ alignSelf: 'center' }} />
        <Text style={styles.lead}>
          Hol das Maximum aus deinem Training – ohne Limits.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <MaterialIcons name="check-circle" size={18} color={C_ACCENT} />
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={C_ACCENT} style={{ marginVertical: 32 }} />
        ) : packages.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {isPurchasesConfigured()
                ? 'Aktuell sind keine Abos verfügbar. Bitte später erneut versuchen.'
                : 'Abos sind in diesem Build noch nicht aktiviert.'}
            </Text>
          </View>
        ) : (
          <View style={styles.packages}>
            {packages.map((pkg) => {
              const { title, sub } = packageLabel(pkg);
              const active = pkg.identifier === selected;
              const isAnnual = pkg.packageType === 'ANNUAL';
              return (
                <Pressable
                  key={pkg.identifier}
                  onPress={() => setSelected(pkg.identifier)}
                  style={[styles.pkg, active && styles.pkgActive]}>
                  {isAnnual && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>BELIEBT</Text>
                    </View>
                  )}
                  <View style={styles.radioOuter}>
                    {active && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pkgTitle}>{title}</Text>
                    <Text style={styles.pkgSub}>{sub}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {packages.length > 0 && (
          <TouchableOpacity
            style={[styles.cta, (busy || !selectedPkg) && { opacity: 0.5 }]}
            onPress={handlePurchase}
            disabled={busy || !selectedPkg}
            activeOpacity={0.85}>
            {busy
              ? <ActivityIndicator color="#121212" />
              : <Text style={styles.ctaText}>Premium freischalten</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleRestore} disabled={busy} style={{ padding: 12 }}>
          <Text style={styles.restoreText}>Käufe wiederherstellen</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Das Abo verlängert sich automatisch zum gewählten Zeitraum, sofern es nicht
          mindestens 24 Stunden vor Ablauf in den Store-Einstellungen gekündigt wird.
          Die Abrechnung erfolgt über deinen App-Store-Account.
        </Text>
        <View style={styles.legalLinks}>
          <Text style={styles.legalLink} onPress={() => router.push('/legal')}>Rechtliches</Text>
          <Text style={styles.legalDot}>·</Text>
          <Text style={styles.legalLink} onPress={() => router.push('/legal')}>Datenschutz</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },
  body: { padding: 20, paddingBottom: 40, gap: 16 },
  lead: { color: '#ddd', fontSize: 15, textAlign: 'center', lineHeight: 21 },
  benefits: { gap: 10, marginTop: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { color: '#eee', fontSize: 14, flex: 1 },
  packages: { gap: 12, marginTop: 8 },
  pkg: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C_CARD, borderRadius: 14, borderWidth: 1.5, borderColor: '#2e2e2e',
    padding: 16,
  },
  pkgActive: { borderColor: C_ACCENT, backgroundColor: '#15242699' },
  badge: {
    position: 'absolute', top: -9, right: 14,
    backgroundColor: C_ACCENT, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeText: { color: '#062023', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#666',
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: C_ACCENT },
  pkgTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pkgSub: { color: '#aaa', fontSize: 13, marginTop: 2 },
  cta: {
    backgroundColor: C_ACCENT, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  ctaText: { color: '#062023', fontSize: 16, fontWeight: '800' },
  restoreText: { color: '#00E5FF', fontSize: 13, textAlign: 'center', fontWeight: '600' },
  emptyBox: { backgroundColor: C_CARD, borderRadius: 12, padding: 16, marginVertical: 12 },
  emptyText: { color: '#aaa', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  legal: { color: '#777', fontSize: 11, lineHeight: 16, marginTop: 8 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  legalLink: { color: '#999', fontSize: 12, textDecorationLine: 'underline' },
  legalDot: { color: '#555', fontSize: 12 },
});
