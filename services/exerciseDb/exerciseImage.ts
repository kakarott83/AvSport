/**
 * services/exerciseDb/exerciseImage.ts
 *
 * Liefert zu einer Übung die Bildframes aus der offenen "free-exercise-db"
 * (github.com/yuhonas/free-exercise-db, CC0, 876 Übungen, davon 873 mit
 * genau 2 Bildern = Start-/Endposition) — ausgeliefert über das jsDelivr-CDN,
 * kein API-Key.
 *
 * Die zwei Frames werden im UI als simple Animation ("Mini-Video" der
 * Bewegung) durchgewechselt. Gematcht wird primär über den von Gemini
 * erzeugten englischen Übungsnamen (`name_en`), hilfsweise über den
 * deutschen Namen. Der Index wird einmal pro Session geladen und ~7 Tage in
 * AsyncStorage gecacht. Kein Treffer / kein Netz → leeres Array.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_URL =
  'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json';
const IMG_BASE =
  'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
const CACHE_KEY = 'exercise-image-db:v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

interface RawEntry {
  name?: string;
  images?: string[];
}

interface SlimEntry {
  name: string;
  images: string[]; // relative Pfade, z. B. ["Barbell_Squat/0.jpg", "Barbell_Squat/1.jpg"]
}

interface IndexEntry {
  norm: string;
  tokens: string[];
  frames: string[]; // volle URLs
}

let indexPromise: Promise<IndexEntry[]> | null = null;
const resultCache = new Map<string, string[]>();

/** Nur für Tests: In-Memory-Caches leeren. */
export function __resetImageCacheForTests(): void {
  indexPromise = null;
  resultCache.clear();
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD') // "ü" → "u" + Kombinationszeichen, das der Filter dann entfernt
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    // naives Stemming: Plural/Singular vereinheitlichen ("rows" ↔ "row",
    // "raises" ↔ "raise"). Beide Seiten gleich behandelt → egal wenn's mal
    // "pres" statt "press" wird.
    .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))
    .join(' ')
    .trim();
}

// ─── Laden & Cachen ──────────────────────────────────────────────────────────

async function readCache(): Promise<SlimEntry[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; data?: SlimEntry[] };
    if (
      parsed.ts &&
      Date.now() - parsed.ts < CACHE_TTL_MS &&
      Array.isArray(parsed.data) &&
      parsed.data.length > 0
    ) {
      return parsed.data;
    }
  } catch {
    /* Cache ignorieren */
  }
  return null;
}

async function fetchSlim(): Promise<SlimEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(DB_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`exercise-db HTTP ${res.status}`);
    const data = (await res.json()) as RawEntry[];

    const slim: SlimEntry[] = [];
    for (const e of data) {
      const images = (e.images ?? []).filter((i) => typeof i === 'string' && i.length > 0);
      if (e.name && images.length > 0) slim.push({ name: e.name, images });
    }

    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: slim }));
    } catch {
      /* Persistieren ist optional */
    }
    return slim;
  } finally {
    clearTimeout(timer);
  }
}

function buildIndex(slim: SlimEntry[]): IndexEntry[] {
  return slim.map((e) => {
    const norm = normalize(e.name);
    return {
      norm,
      tokens: norm.split(' ').filter(Boolean),
      frames: e.images.map((rel) => IMG_BASE + rel),
    };
  });
}

function getIndex(): Promise<IndexEntry[]> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const slim = (await readCache()) ?? (await fetchSlim());
      return buildIndex(slim);
    })().catch((err) => {
      console.warn('[exerciseDb] Index konnte nicht geladen werden:', err);
      indexPromise = null; // nächster Aufruf darf erneut versuchen
      return [];
    });
  }
  return indexPromise;
}

// ─── Matching ────────────────────────────────────────────────────────────────

function findFrames(index: IndexEntry[], query: string): string[] | null {
  const q = normalize(query);
  if (!q) return null;
  const qTokens = q.split(' ').filter(Boolean);
  if (qTokens.length === 0) return null;

  // 1. Exakter (normalisierter) Name.
  const exact = index.find((e) => e.norm === q);
  if (exact) return exact.frames;

  // 2. Bestes Token-Overlap: möglichst viele Query-Tokens im Namen,
  //    kürzere (generischere) Namen bevorzugt, Namen die mit der Suche
  //    beginnen ("Barbell Bench Press [- Medium Grip]") stark bevorzugt.
  let best: { frames: string[]; score: number } | null = null;
  for (const e of index) {
    const matched = qTokens.filter((t) => e.tokens.includes(t)).length;
    if (matched === 0) continue;
    let score =
      matched / qTokens.length + // wie viel der Suche ist abgedeckt
      (matched / e.tokens.length) * 0.5 - // wie „passend“ ist der Name
      e.tokens.length * 0.02; // Längenstrafe
    if (e.norm.startsWith(`${q} `) || q.startsWith(`${e.norm} `)) score += 1;
    if (!best || score > best.score) best = { frames: e.frames, score };
  }
  if (best && best.score >= 0.6) return best.frames;

  return null;
}

// ─── Öffentliche API ─────────────────────────────────────────────────────────

/**
 * Bild-Frames für eine Übung (0, 1 oder 2 URLs). Leeres Array = kein Treffer.
 * Wirft nie.
 * @param nameEn englischer Übungsname (bevorzugt, von Gemini)
 * @param nameDe deutscher Übungsname (Fallback)
 */
export async function fetchExerciseFrames(
  nameEn?: string | null,
  nameDe?: string | null,
): Promise<string[]> {
  const key = `${(nameEn ?? '').trim().toLowerCase()}|${(nameDe ?? '').trim().toLowerCase()}`;
  if (key === '|') return [];

  const cached = resultCache.get(key);
  if (cached !== undefined) return cached;

  let frames: string[] = [];
  try {
    const index = await getIndex();
    if (index.length > 0) {
      frames =
        (nameEn ? findFrames(index, nameEn) : null) ??
        (nameDe ? findFrames(index, nameDe) : null) ??
        [];
    }
  } catch (err) {
    console.warn('[exerciseDb] Bildsuche fehlgeschlagen:', err);
  }

  if (__DEV__) {
    console.log(`[exerciseDb] "${nameEn ?? nameDe}" → ${frames.length} Frame(s)`);
  }

  resultCache.set(key, frames);
  return frames;
}
