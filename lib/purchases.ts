/**
 * lib/purchases.ts
 *
 * Privater Wrapper um `react-native-purchases` (RevenueCat). Der Rest der App
 * importiert nur aus dieser Datei, nicht direkt aus dem SDK — gleiches Muster
 * wie services/gemini/client.ts.
 *
 * Ohne gesetzte RevenueCat-Keys ist alles ein No-op: `configurePurchases()`
 * meldet `false`, `isConfigured` bleibt `false`, `getPremiumStatus()` liefert
 * `false`, die Paywall zeigt einen Hinweis. Die App bleibt voll nutzbar.
 *
 * Der `appUserID` wird bewusst nicht bei `configure` gesetzt, sondern nach dem
 * Login per `identifyUser(supabaseUserId)` — so ist die RevenueCat-ID == die
 * Supabase-User-ID und der Webhook (supabase/functions/revenuecat-webhook)
 * kann `profiles` per `app_user_id` zuordnen.
 */

import { NativeModules, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

/** Entitlement-Bezeichner aus dem RevenueCat-Dashboard. */
export const PREMIUM_ENTITLEMENT = 'premium';

/** Wird geworfen, wenn der Nutzer den Kauf abgebrochen hat (kein echter Fehler). */
export class PurchaseCancelledError extends Error {
  constructor() {
    super('Kauf abgebrochen.');
    this.name = 'PurchaseCancelledError';
  }
}

let configured = false;

export function isPurchasesConfigured(): boolean {
  return configured;
}

/**
 * Ist die native RevenueCat-Lib im laufenden Binary vorhanden? In Expo Go oder
 * in einem Dev-Build, der vor dem Hinzufügen von `react-native-purchases`
 * gebaut wurde, ist `RNPurchases` `null` — dann muss der Wrapper ein No-op
 * bleiben, sonst wirft `Purchases.setLogLevel()` eine Unhandled Promise
 * Rejection ("Cannot read property 'setLogLevel' of null").
 */
function isNativeModuleAvailable(): boolean {
  return NativeModules.RNPurchases != null;
}

function resolveApiKey(): string | null {
  const key =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

/**
 * Einmalig beim App-Start aufrufen. Gibt `true` zurück, wenn das SDK
 * konfiguriert wurde, `false` wenn kein Key hinterlegt ist.
 */
export function configurePurchases(): boolean {
  if (configured) return true;

  if (!isNativeModuleAvailable()) {
    console.warn(
      '[Purchases] Natives Modul (RNPurchases) nicht verfügbar — In-App-Abos inaktiv. ' +
        'Dev-Build neu bauen, damit die RevenueCat-Lib eingebunden wird.',
    );
    return false;
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.warn('[Purchases] Kein RevenueCat-Key gesetzt — In-App-Abos inaktiv.');
    return false;
  }

  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    configured = true;
    return true;
  } catch (err) {
    console.warn('[Purchases] configure() fehlgeschlagen:', err);
    return false;
  }
}

/** RevenueCat an den eingeloggten Supabase-User binden. */
export async function identifyUser(userId: string): Promise<void> {
  if (!configured || !userId) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.warn('[Purchases] logIn fehlgeschlagen:', err);
  }
}

/** Beim Logout: zurück auf einen anonymen RevenueCat-User. */
export async function resetUser(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    // logOut wirft, wenn der User bereits anonym ist — unkritisch.
    if (__DEV__) console.warn('[Purchases] logOut:', err);
  }
}

// ─── Entitlement ─────────────────────────────────────────────────────────────

export function isPremiumFromInfo(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
}

export async function getCustomerInfoSafe(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.warn('[Purchases] getCustomerInfo fehlgeschlagen:', err);
    return null;
  }
}

export async function getPremiumStatus(): Promise<boolean> {
  return isPremiumFromInfo(await getCustomerInfoSafe());
}

// ─── Angebote & Kauf ─────────────────────────────────────────────────────────

/** Das aktuelle Offering aus dem RevenueCat-Dashboard oder `null`. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (err) {
    console.warn('[Purchases] getOfferings fehlgeschlagen:', err);
    return null;
  }
}

function isUserCancelled(err: unknown): boolean {
  const e = err as { userCancelled?: unknown; code?: unknown; info?: { userCancelled?: unknown } };
  return (
    e?.userCancelled === true ||
    e?.info?.userCancelled === true ||
    e?.code === '1' /* PURCHASE_CANCELLED */
  );
}

/**
 * Kauft ein Paket. Wirft `PurchaseCancelledError` bei Nutzer-Abbruch,
 * sonst den ursprünglichen Fehler. Liefert die aktualisierten `CustomerInfo`.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  try {
    const result = await Purchases.purchasePackage(pkg);
    return result.customerInfo;
  } catch (err) {
    if (isUserCancelled(err)) throw new PurchaseCancelledError();
    throw err;
  }
}

/** Frühere Käufe wiederherstellen. Gibt `true`, wenn danach Premium aktiv ist. */
export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return isPremiumFromInfo(info);
}

// ─── Listener ────────────────────────────────────────────────────────────────

export type PremiumListener = (isPremium: boolean) => void;

/** Meldet Änderungen am Premium-Status (Kauf, Renewal, Ablauf). */
export function addPremiumListener(listener: PremiumListener): () => void {
  if (!configured) return () => {};
  const wrapped = (info: CustomerInfo) => listener(isPremiumFromInfo(info));
  Purchases.addCustomerInfoUpdateListener(wrapped);
  return () => Purchases.removeCustomerInfoUpdateListener(wrapped);
}
