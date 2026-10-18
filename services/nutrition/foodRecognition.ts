import { getLanguage, t } from '@/lib/i18n';
import { geminiRequest, type GeminiPart } from '@/services/gemini/client';

export interface RecognizedItem {
  name:        string; // English name for USDA lookup
  name_de:     string; // Anzeigename in der App-Sprache (UI, food_logs) — Feldname historisch
  grams:       number;
  preparation: string; // e.g. "grilled", "boiled", "raw"
}

export interface FoodRecognitionResult {
  items:         RecognizedItem[];
  meal_name?:    string; // Kurzer Mahlzeit-Name in der App-Sprache (nur Foto-Erkennung)
  health_notes?: string; // Ein motivierender Satz zur Zusammensetzung (nur Foto-Erkennung)
}

// Anzeigetexte (name_de, meal_name, health_notes, Fehlermeldung) erzeugt
// Gemini in der aktuell gewählten App-Sprache.
const DISPLAY_LANGUAGE = {
  de: {
    name: 'German',
    itemExamples: '"Hähnchenbrust", "weißer Reis", "Brokkoli", "Olivenöl"',
    mealExample: '"Gegrilltes Hähnchenbrustfilet mit Reis und Brokkoli"',
    notesExample: '"Exzellente Proteinquelle mit ausgewogenen Kohlenhydraten."',
  },
  en: {
    name: 'English',
    itemExamples: '"Chicken breast", "White rice", "Broccoli", "Olive oil"',
    mealExample: '"Grilled chicken breast with rice and broccoli"',
    notesExample: '"Excellent source of protein with balanced carbohydrates."',
  },
} as const;

function jsonFormat(): string {
  const lang = DISPLAY_LANGUAGE[getLanguage()];
  return (
    'Return ONLY valid JSON — no markdown, no explanation, no extra text. ' +
    'Format: {"items":[{"name":string,"name_de":string,"grams":number,"preparation":string}]}. ' +
    '"name" must be a common English food name suitable for database lookup ' +
    '(e.g. "chicken breast", "white rice", "broccoli", "olive oil"). ' +
    `"name_de" is the same food item as a natural ${lang.name} name for display to the user ` +
    `(e.g. ${lang.itemExamples}). ` +
    'For preparation use exactly one English word: ' +
    '"grilled", "boiled", "fried", "steamed", "raw", "baked", "roasted", or "mixed".'
  );
}

// Zusatzfelder nur für die Foto-Erkennung. Nährwerte rechnet bewusst nicht
// Gemini, sondern die USDA-Kette in nutritionProvider.
function photoExtras(): string {
  const lang = DISPLAY_LANGUAGE[getLanguage()];
  return (
    ' Additionally include at the top level: ' +
    `"meal_name": a short, concise ${lang.name} name for the whole meal ` +
    `(e.g. ${lang.mealExample}), and ` +
    `"health_notes": one short, motivating ${lang.name} sentence about the composition of the meal ` +
    `(e.g. ${lang.notesExample}). ` +
    'If the image contains no food or recognition is impossible, return exactly ' +
    `{"error":"${t('ai.noFoodPhoto')}"} instead.`
  );
}

function buildPrompt(notes?: string): string {
  let p =
    'You are a precise, health-oriented food recognition system for nutrition tracking. ' +
    'Analyze the provided food image. ' +
    'If a second image is provided, it shows a reference object (hand or cutlery) — ' +
    'use it to estimate portion sizes more accurately. ' +
    'Identify every visible food component on the plate or in the packaging ' +
    'and estimate realistic portion sizes in grams. ';
  if (notes?.trim()) p += `Additional user context: "${notes.trim()}". `;
  return p + jsonFormat() + photoExtras();
}

/**
 * Wandelt eine frei formulierte (getippte oder diktierte) Beschreibung in eine
 * Item-Liste um — gleiches Format wie die Foto-Erkennung, damit die
 * Nährwert-Kette (USDA → LLM-Fallback) unverändert weiterarbeitet.
 * Jedes Item wird später als eigener food_logs-Eintrag gespeichert, daher
 * bleiben vom Nutzer genannte Gerichte ein Item statt in Zutaten zu zerfallen.
 */
export async function recognizeFoodFromText(description: string): Promise<FoodRecognitionResult> {
  const prompt =
    `You are a food logging assistant. The user describes in ${DISPLAY_LANGUAGE[getLanguage()].name} (possibly ` +
    'dictated, informal) what they ate, possibly over a whole day. Split the description ' +
    'into the distinct dishes, foods and drinks the user mentions. ' +
    'Keep a named dish as ONE item — do not split it into ingredients ' +
    '(e.g. "Spaghetti Bolognese", "Müsli mit Milch" or "Käsebrot" are one item each, ' +
    'with "name" like "spaghetti bolognese"). ' +
    'Use the quantities the user states (convert pieces, slices, cups, spoons etc. to grams); ' +
    'if no quantity is given, estimate a typical single portion. ' +
    'Ignore anything that is not food or drink. ' +
    `User description: "${description.trim()}". ` +
    jsonFormat();

  const text = await geminiRequest([{ text: prompt }], "food_text");
  if (!text) throw new Error('[FoodRecognition] Leere Antwort von Gemini');
  const { items } = parseResult(text, t('ai.noFoodText'));
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

  const text = await geminiRequest(parts, "food_photo");
  if (!text) throw new Error('[FoodRecognition] Leere Antwort von Gemini');

  const result = parseResult(text, t('ai.noFoodPhoto'));
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
