import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FoodAnalysisResponse } from '@/services/gemini/nutritionProvider';

const STORAGE_KEY    = 'nutrition_image_cache_v1';
const TTL_MS         = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const MAX_ENTRIES    = 20;
const HASH_SAMPLES   = 64;
const HASH_THRESHOLD = 8; // max. Hamming-Distanz für Cache-Hit (von 64)

interface CacheEntry {
  hash:      string;
  timestamp: number;
  result:    FoodAnalysisResponse;
}

// ── Hash-Berechnung ───────────────────────────────────────────────────────────
//
// Abtast-Hash auf der Base64-Zeichenkette: wir samplen HASH_SAMPLES gleichmäßig
// verteilte Bytes, vergleichen jeden Wert mit dem Durchschnitt und generieren
// einen 64-Bit-Binärstring. Fotos desselben Tellers ergeben sehr ähnliche
// Hashes (kleine Hamming-Distanz); völlig unterschiedliche Fotos liegen weit
// auseinander. Echter pHash würde dekodierte Pixelwerte benötigen; dieser
// Ansatz ist für identische oder nahezu identische Aufnahmen ausreichend.

function computeHash(base64: string): string {
  const step    = Math.max(1, Math.floor(base64.length / HASH_SAMPLES));
  const samples = Array.from({ length: HASH_SAMPLES }, (_, i) =>
    base64.charCodeAt(Math.min(i * step, base64.length - 1)),
  );
  const avg = samples.reduce((a, b) => a + b, 0) / HASH_SAMPLES;
  return samples.map(v => (v >= avg ? '1' : '0')).join('');
}

function hamming(a: string, b: string): number {
  let d = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++;
  return d;
}

// ── AsyncStorage-Helfer ───────────────────────────────────────────────────────

async function loadEntries(): Promise<CacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CacheEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveEntries(entries: CacheEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('[NutritionCache] Schreibfehler:', err);
  }
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

export async function getCachedResult(
  imageBase64: string,
): Promise<FoodAnalysisResponse | null> {
  const hash    = computeHash(imageBase64);
  const now     = Date.now();
  const entries = await loadEntries();

  // Abgelaufene Einträge herausfiltern, dann nach Ähnlichkeit suchen
  const alive = entries.filter(e => now - e.timestamp < TTL_MS);
  for (const entry of alive) {
    const dist = hamming(hash, entry.hash);
    if (dist <= HASH_THRESHOLD) {
      console.log(`[NutritionCache] Cache-Hit (Hamming: ${dist})`);
      return entry.result;
    }
  }
  return null;
}

export async function setCachedResult(
  imageBase64: string,
  result: FoodAnalysisResponse,
): Promise<void> {
  const hash  = computeHash(imageBase64);
  const now   = Date.now();
  let entries = await loadEntries();

  // Abgelaufene entfernen + auf MAX_ENTRIES - 1 kürzen (neueste zuerst)
  entries = entries
    .filter(e => now - e.timestamp < TTL_MS)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ENTRIES - 1);

  entries.unshift({ hash, timestamp: now, result });
  await saveEntries(entries);
  console.log('[NutritionCache] Ergebnis gecacht');
}
