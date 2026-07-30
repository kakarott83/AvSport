import { geminiRequest } from './client';
import type { Macros }   from '@/services/nutrition/usdaLookup';

/**
 * Schätzung der Nährwerte via Gemini-Text-Call — nur wenn USDA keinen
 * Treffer liefert. Kein Bild, kein Vision-Call: nur ein kleiner Text-Prompt.
 */
export async function lookupNutrientsViaLLM(
  name: string,
  grams: number,
  preparation?: string,
): Promise<Macros> {
  const description = preparation
    ? `${grams}g ${preparation} ${name}`
    : `${grams}g ${name}`;

  const prompt =
    `Give accurate nutritional values for: ${description}. ` +
    'Return ONLY valid JSON — no markdown, no explanation. ' +
    'Format: {"calories":number,"protein":number,"carbs":number,"fat":number}. ' +
    'All values must be for the given total portion size (not per 100g).';

  const text = await geminiRequest([{ text: prompt }]);
  if (!text) throw new Error(`[NutritionFallback] Leere Antwort für "${name}"`);

  const raw = JSON.parse(text) as Partial<Macros>;
  return {
    calories: Number(raw.calories) || 0,
    protein:  Number(raw.protein)  || 0,
    carbs:    Number(raw.carbs)    || 0,
    fat:      Number(raw.fat)      || 0,
  };
}
