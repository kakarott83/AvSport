import { geminiRequest, type GeminiPart } from './client';

export interface FoodAnalysisResponse {
  name:       string;
  calories:   number;
  protein:    number;
  carbs:      number;
  fat:        number;
  confidence: number;
}

function buildPrompt(notes?: string): string {
  let p =
    'Analyze the provided food image(s). ' +
    'If a second image is provided, it shows a reference object (like a hand or cutlery) next to the plate — use it to estimate portion size more accurately. ';
  if (notes?.trim()) p += `Additional context from the user: "${notes.trim()}". `;
  p +=
    'Return ONLY a valid JSON object with exactly these keys: ' +
    '{"name": string, "calories": number, "protein": number, "carbs": number, "fat": number}. ' +
    'No markdown, no explanation, no extra text — just the JSON object.';
  return p;
}

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
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error('FoodAnalysis: "name" fehlt');
  }
  for (const field of ['calories', 'protein', 'carbs', 'fat'] as const) {
    if (typeof raw[field] !== 'number') {
      throw new Error(`FoodAnalysis: "${field}" muss eine Zahl sein`);
    }
  }
}

/**
 * Analysiert ein oder zwei Base64-kodierte JPEG-Bilder und optionale Notizen.
 * Das zweite Bild (Referenzobjekt) verbessert die Portionsschätzung.
 */
export async function analyzeFoodImage(
  base64_1: string,
  base64_2?: string,
  notes?: string,
): Promise<FoodAnalysisResponse> {
  const parts: GeminiPart[] = [
    { text: buildPrompt(notes) },
    { inline_data: { mime_type: 'image/jpeg', data: base64_1 } },
  ];

  if (base64_2) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64_2 } });
  }

  const text = await geminiRequest(parts);

  if (!text) throw new Error('[Nutrition] Gemini: leere Antwort');

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
