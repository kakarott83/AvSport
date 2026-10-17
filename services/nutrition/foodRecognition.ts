import { geminiRequest, type GeminiPart } from '@/services/gemini/client';

export interface RecognizedItem {
  name:        string; // English name for USDA lookup
  name_de:     string; // Deutscher Anzeigename (UI, food_logs)
  grams:       number;
  preparation: string; // e.g. "grilled", "boiled", "raw"
}

export interface FoodRecognitionResult {
  items:         RecognizedItem[];
  meal_name?:    string; // Kurzer deutscher Mahlzeit-Name (nur Foto-Erkennung)
  health_notes?: string; // Ein motivierender Satz zur Zusammensetzung (nur Foto-Erkennung)
}

const NO_FOOD_PHOTO =
  'Konnte keine Lebensmittel auf dem Bild erkennen. Bitte versuche ein klareres Foto hochzuladen.';

const JSON_FORMAT =
  'Return ONLY valid JSON — no markdown, no explanation, no extra text. ' +
  'Format: {"items":[{"name":string,"name_de":string,"grams":number,"preparation":string}]}. ' +
  '"name" must be a common English food name suitable for database lookup ' +
  '(e.g. "chicken breast", "white rice", "broccoli", "olive oil"). ' +
  '"name_de" is the same food item as a natural German name for display to the user ' +
  '(e.g. "Hähnchenbrust", "weißer Reis", "Brokkoli", "Olivenöl"). ' +
  'For preparation use exactly one English word: ' +
  '"grilled", "boiled", "fried", "steamed", "raw", "baked", "roasted", or "mixed".';

// Zusatzfelder nur für die Foto-Erkennung. Nährwerte rechnet bewusst nicht
// Gemini, sondern die USDA-Kette in nutritionProvider.
const PHOTO_EXTRAS =
  ' Additionally include at the top level: ' +
  '"meal_name": a short, concise German name for the whole meal ' +
  '(e.g. "Gegrilltes Hähnchenbrustfilet mit Reis und Brokkoli"), and ' +
  '"health_notes": one short, motivating German sentence about the composition of the meal ' +
  '(e.g. "Exzellente Proteinquelle mit ausgewogenen Kohlenhydraten."). ' +
  'If the image contains no food or recognition is impossible, return exactly ' +
  `{"error":"${NO_FOOD_PHOTO}"} instead.`;

function buildPrompt(notes?: string): string {
  let p =
    'You are a precise, health-oriented food recognition system for nutrition tracking. ' +
    'Analyze the provided food image. ' +
    'If a second image is provided, it shows a reference object (hand or cutlery) — ' +
    'use it to estimate portion sizes more accurately. ' +
    'Identify every visible food component on the plate or in the packaging ' +
    'and estimate realistic portion sizes in grams. ';
  if (notes?.trim()) p += `Additional user context: "${notes.trim()}". `;
  return p + JSON_FORMAT + PHOTO_EXTRAS;
}

/**
 * Wandelt eine frei formulierte (getippte oder diktierte) Beschreibung in eine
 * Item-Liste um — gleiches Format wie die Foto-Erkennung, damit die
 * Nährwert-Kette (USDA → LLM-Fallback) unverändert weiterarbeitet.
 */
export async function recognizeFoodFromText(description: string): Promise<FoodRecognitionResult> {
  const prompt =
    'You are a food logging assistant. The user describes in German (possibly ' +
    'dictated, informal) what they ate. Split the description into distinct food items. ' +
    'Use the quantities the user states (convert pieces, slices, cups, spoons etc. to grams); ' +
    'if no quantity is given, estimate a typical single portion. ' +
    'Ignore anything that is not food or drink. ' +
    `User description: "${description.trim()}". ` +
    JSON_FORMAT;

  const text = await geminiRequest([{ text: prompt }]);
  if (!text) throw new Error('[FoodRecognition] Leere Antwort von Gemini');
  const { items } = parseResult(text, 'In deiner Beschreibung wurde kein Essen erkannt');
  return { items };
}

export async function recognizeFoodItems(
  base64_1: string,
  base64_2?: string,
  notes?: string,
): Promise<FoodRecognitionResult> {
  const parts: GeminiPart[] = [
    { text: buildPrompt(notes) },
    { inline_data: { mime_type: 'image/jpeg', data: base64_1 } },
  ];
  if (base64_2) parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64_2 } });

  const text = await geminiRequest(parts);
  if (!text) throw new Error('[FoodRecognition] Leere Antwort von Gemini');

  const result = parseResult(text, NO_FOOD_PHOTO);
  console.log(
    '[FoodRecognition] Erkannt:',
    result.meal_name ?? '–', '|',
    result.items.map(i => `${i.grams}g ${i.name_de} (${i.preparation})`).join(', '),
  );
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseResult(text: string, emptyMessage: string): FoodRecognitionResult {
  const parsed = JSON.parse(text) as { items?: unknown[]; error?: unknown; meal_name?: unknown; health_notes?: unknown };
  // Gemini meldet "kein Essen" per {"error": …} — die Meldung ist für den Nutzer formuliert.
  if (parsed.error !== undefined && parsed.error !== null) {
    throw new Error(optionalString(parsed.error) ?? emptyMessage);
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error(emptyMessage);
  }

  const items = (parsed.items as Record<string, unknown>[]).map(
    (item, i) => {
      if (typeof item.name !== 'string' || !item.name.trim()) {
        throw new Error(`[FoodRecognition] Item ${i}: "name" fehlt`);
      }
      const grams = Number(item.grams);
      if (!grams || grams <= 0) {
        throw new Error(`[FoodRecognition] Item ${i} "${item.name}": ungültige Grammangabe`);
      }
      const nameDe = typeof item.name_de === 'string' ? item.name_de.trim() : '';
      return {
        name:        item.name.trim(),
        name_de:     nameDe || item.name.trim(),
        grams,
        preparation: typeof item.preparation === 'string' ? item.preparation.trim() : '',
      };
    },
  );

  return {
    items,
    meal_name:    optionalString(parsed.meal_name),
    health_notes: optionalString(parsed.health_notes),
  };
}
