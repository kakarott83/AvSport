/**
 * services/gemini/nutritionProvider.ts
 *
 * Analysiert Lebensmittelbilder über den Gemini-Vision-Client.
 */

import { geminiRequest } from './client';

// ─── Öffentliches Interface (KI-Antwort-Shape) ────────────────────────────────

/** Nährwertdaten, wie sie Gemini zurückgibt. Kompatibel mit types/vision.ts FoodAnalysis. */
export interface FoodAnalysisResponse {
  name:       string;
  calories:   number;
  protein:    number;
  carbs:      number;
  fat:        number;
  /** Immer 1.0 — Gemini liefert keinen Konfidenzwert; gesetzt für Abwärtskompatibilität. */
  confidence: number;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const FOOD_PROMPT =
  'Analyze this food image. Return ONLY a valid JSON object with exactly these keys: ' +
  '{"name": string, "calories": number, "protein": number, "carbs": number, "fat": number}. ' +
  'No markdown, no explanation, no extra text — just the JSON object.';

// ─── Response-Validierung ─────────────────────────────────────────────────────

interface RawFoodAnalysis {
  name?:     unknown;
  calories?: unknown;
  protein?:  unknown;
  carbs?:    unknown;
  fat?:      unknown;
}

function validateResponse(raw: RawFoodAnalysis): asserts raw is {
  name: string; calories: number; protein: number; carbs: number; fat: number;
} {
  const numFields = ['calories', 'protein', 'carbs', 'fat'] as const;
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error('FoodAnalysis: "name" fehlt');
  }
  for (const field of numFields) {
    if (typeof raw[field] !== 'number') {
      throw new Error(`FoodAnalysis: "${field}" muss eine Zahl sein`);
    }
  }
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

/**
 * Analysiert ein Base64-kodiertes JPEG-Bild und gibt Nährwertdaten zurück.
 * Wirft bei API-Fehler oder ungültigem JSON (kein Fallback — Caller entscheidet).
 */
export async function analyzeFoodImage(base64: string): Promise<FoodAnalysisResponse> {
  const text = await geminiRequest([
    { text: FOOD_PROMPT },
    { inline_data: { mime_type: 'image/jpeg', data: base64 } },
  ]);

  // geminiRequest wirft bereits bei leerer Antwort — hier zur Sicherheit nochmal prüfen
  if (!text) {
    throw new Error('[Nutrition] Gemini: leere Antwort — kein Speicherversuch');
  }

  console.log('[Nutrition] Gemini-Antwort (Vorschau):', text.slice(0, 120));

  const parsed = JSON.parse(text) as RawFoodAnalysis;
  validateResponse(parsed);

  return {
    name:       parsed.name,
    calories:   parsed.calories,
    protein:    parsed.protein,
    carbs:      parsed.carbs,
    fat:        parsed.fat,
    confidence: 1.0,
  };
}
