import AsyncStorage from "@react-native-async-storage/async-storage";

// ─────────────────────────────────────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────────────────────────────────────

/** Alle Dashboard-Werte, die lokal gecacht werden. */
export type CachedDashboard = {
  todayKcal: number;
  todayProtein: number;
  burnedKcal: number;
  proteinGoal: number;
  healthSteps: number;
  healthBurnKcal: number;
  cachedAt: number; // Unix-Timestamp in ms
};

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY = "@avora/dashboard_v1";

/**
 * Cache-Einträge älter als 24 Stunden werden beim Lesen verworfen.
 * Tagesbezogene Daten (Kcal, Schritte) werden ohnehin täglich zurückgesetzt.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Ab 5 Minuten gilt der Cache als "veraltet" → Offline-Hinweis im UI.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Öffentliche API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lädt den letzten Dashboard-Snapshot aus AsyncStorage.
 * Gibt null zurück wenn kein Cache vorhanden, der Parse fehlschlägt
 * oder der Cache älter als 24 Stunden ist.
 */
export async function loadCache(): Promise<CachedDashboard | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const data: CachedDashboard = JSON.parse(raw);

    if (Date.now() - data.cachedAt > MAX_AGE_MS) {
      console.log("[Cache] Eintrag zu alt (> 24h) – verworfen");
      return null;
    }

    console.log(
      `[Cache] Geladen – Alter: ${Math.round((Date.now() - data.cachedAt) / 1000)}s`,
    );
    return data;
  } catch (error) {
    console.warn("[Cache] Lesen fehlgeschlagen:", error);
    return null;
  }
}

/**
 * Speichert einen frischen Dashboard-Snapshot.
 * Schreibfehler sind nicht fatal und werden nur geloggt.
 */
export async function saveCache(
  data: Omit<CachedDashboard, "cachedAt">,
): Promise<void> {
  try {
    const entry: CachedDashboard = { ...data, cachedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    console.log("[Cache] Gespeichert");
  } catch (error) {
    console.warn("[Cache] Schreiben fehlgeschlagen:", error);
  }
}

/**
 * Gibt true zurück, wenn der Cache-Eintrag älter als STALE_AFTER_MS (5 min) ist.
 * Wird verwendet, um im UI zu entscheiden ob "Offline · Gerade eben" oder
 * "Offline · Cache vom HH:MM" angezeigt werden soll.
 */
export function isStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > STALE_AFTER_MS;
}
