import { geminiRequest, type GeminiPart } from '@/services/gemini/client';

export interface RecognizedItem {
  name:        string; // English name for USDA lookup
  grams:       number;
  preparation: string; // e.g. "grilled", "boiled", "raw"
}

export interface FoodRecognitionResult {
  items: RecognizedItem[];
}

function buildPrompt(notes?: string): string {
  let p =
    'You are a food recognition system. Analyze the provided food image. ' +
    'If a second image is provided, it shows a reference object (hand or cutlery) — ' +
    'use it to estimate portion sizes more accurately. ' +
    'Identify each distinct food component on the plate. ';
  if (notes?.trim()) p += `Additional user context: "${notes.trim()}". `;
  p +=
    'Return ONLY valid JSON — no markdown, no explanation, no extra text. ' +
    'Format: {"items":[{"name":string,"grams":number,"preparation":string}]}. ' +
    'Use common English food names suitable for database lookup ' +
    '(e.g. "chicken breast", "white rice", "broccoli", "olive oil"). ' +
    'For preparation use exactly one English word: ' +
    '"grilled", "boiled", "fried", "steamed", "raw", "baked", "roasted", or "mixed".';
  return p;
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

  const parsed = JSON.parse(text) as { items?: unknown[] };
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error('Kein Essen auf dem Foto erkannt');
  }

  const items: RecognizedItem[] = (parsed.items as Record<string, unknown>[]).map(
    (item, i) => {
      if (typeof item.name !== 'string' || !item.name.trim()) {
        throw new Error(`[FoodRecognition] Item ${i}: "name" fehlt`);
      }
      const grams = Number(item.grams);
      if (!grams || grams <= 0) {
        throw new Error(`[FoodRecognition] Item ${i} "${item.name}": ungültige Grammangabe`);
      }
      return {
        name:        item.name.trim(),
        grams,
        preparation: typeof item.preparation === 'string' ? item.preparation.trim() : '',
      };
    },
  );

  console.log(
    '[FoodRecognition] Erkannt:',
    items.map(i => `${i.grams}g ${i.name} (${i.preparation})`).join(', '),
  );
  return { items };
}
