/**
 * services/wger/exerciseImage.ts
 *
 * Sucht ein passendes Übungsbild in der offenen wger.de-Datenbank
 * (kostenlos, kein API-Key, CC-lizenzierte Strichzeichnungen). Die
 * KI-Übungsnamen sind deutscher Freitext, daher ist ein Treffer nicht
 * garantiert — ohne Treffer wird `null` zurückgegeben und im UI einfach
 * kein Bild angezeigt. Ergebnisse werden pro Session im Speicher gecacht,
 * damit dieselbe Übung nur einmal angefragt wird.
 */

const WGER_INFO_URL = 'https://wger.de/api/v2/exerciseinfo/';

interface WgerImage {
  image?:   string | null;
  is_main?: boolean;
}

interface WgerExerciseInfo {
  images?: WgerImage[];
}

interface WgerResponse {
  results?: WgerExerciseInfo[];
}

// name (lowercase, getrimmt) → Bild-URL oder null. `undefined` = noch nie angefragt.
const cache = new Map<string, string | null>();

/** Erstes brauchbare Bild aus den (nach Relevanz sortierten) Treffern. */
function pickImage(results: WgerExerciseInfo[]): string | null {
  for (const exercise of results) {
    const images = exercise.images ?? [];
    const best =
      images.find((img) => img.is_main && img.image) ??
      images.find((img) => img.image);
    if (best?.image) return best.image;
  }
  return null;
}

async function query(term: string, language: 'de' | 'en'): Promise<string | null> {
  const url =
    `${WGER_INFO_URL}?format=json&limit=5` +
    `&language__code=${language}` +
    `&name__search=${encodeURIComponent(term)}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const json = (await res.json()) as WgerResponse;
  return pickImage(json.results ?? []);
}

/**
 * Liefert die URL eines passenden Übungsbilds oder `null`.
 * Wirft nie — bei Netzwerk-/Parsing-Fehlern wird `null` zurückgegeben.
 */
export async function fetchExerciseImage(exerciseName: string): Promise<string | null> {
  const key = exerciseName.trim().toLowerCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let image: string | null = null;
  try {
    image = (await query(exerciseName, 'de')) ?? (await query(exerciseName, 'en'));
  } catch (err) {
    console.warn('[wger] Bildsuche fehlgeschlagen:', err);
  }

  cache.set(key, image);
  return image;
}
