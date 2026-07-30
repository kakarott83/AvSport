import { recognizeFoodItems }             from '@/services/nutrition/foodRecognition';
import { lookupNutrients }               from '@/services/nutrition/usdaLookup';
import { lookupNutrientsViaLLM }         from './nutritionFallback';
import { getCachedResult, setCachedResult } from '@/services/nutrition/nutritionCache';
import { supabase }                      from '@/services/supabaseClient';
import type { Macros }                   from '@/services/nutrition/usdaLookup';

// ── Öffentliches Interface (bleibt identisch → FoodScanner.tsx unverändert) ──

export interface FoodAnalysisResponse {
  name:       string;
  calories:   number;
  protein:    number;
  carbs:      number;
  fat:        number;
  confidence: number;
}

// ── Kosten-Logging ────────────────────────────────────────────────────────────

type CallType = 'cache_hit' | 'usda' | 'usda_fallback' | 'llm_fallback';

interface CostLogRow {
  user_id:   string | null;
  call_type: CallType;
  item_name: string | null;
}

const pendingLogs: CostLogRow[] = [];

async function getUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function flushCostLogs(userId: string | null): Promise<void> {
  if (pendingLogs.length === 0) return;
  const rows = pendingLogs.splice(0).map(r => ({ ...r, user_id: userId }));
  try {
    const { error } = await supabase.from('nutrition_cost_logs').insert(rows);
    if (error) console.warn('[CostTracker] Supabase-Fehler:', error.message);
  } catch (err) {
    console.warn('[CostTracker] Supabase nicht erreichbar:', err);
  }
}

function logCost(type: CallType, itemName: string | null): void {
  console.log(`[CostTracker] ${type.padEnd(14)} | ${itemName ?? '–'}`);
  pendingLogs.push({ user_id: null, call_type: type, item_name: itemName });
}

// ── Haupt-Funktion ────────────────────────────────────────────────────────────

/**
 * Analysiert ein Mahlzeitfoto in zwei Schritten:
 *  1. Gemini Vision erkennt Lebensmittel + Portionsgrößen (englische Namen)
 *  2. USDA FoodData Central liefert exakte Nährwerte je Item
 *     → Fallback: zweite USDA-Suche ohne Zubereitungsart
 *     → Letzter Ausweg: kleiner Gemini-Text-Call nur für dieses Item
 *
 * Ähnliche Fotos werden 7 Tage gecacht (Hash-Vergleich, kein erneuter API-Call).
 * Alle Aufrufe werden in nutrition_cost_logs (Supabase) persistiert.
 * Gleiche Signatur wie vorher → FoodScanner.tsx braucht keine Änderung.
 */
export async function analyzeFoodImage(
  base64_1: string,
  base64_2?: string,
  notes?: string,
): Promise<FoodAnalysisResponse> {

  // ── Schritt 0: Cache-Check ─────────────────────────────────────────────────
  const cached = await getCachedResult(base64_1);
  if (cached) {
    logCost('cache_hit', null);
    const userId = await getUserId();
    void flushCostLogs(userId);
    return cached;
  }

  // ── Schritt 1: Vision-Call → Item-Liste ───────────────────────────────────
  const { items } = await recognizeFoodItems(base64_1, base64_2, notes);

  // ── Schritt 2: Nährwert-Lookup für jedes Item ─────────────────────────────
  const totals: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let usedLLMFallback  = false;
  let resolvedCount    = 0;

  for (const item of items) {
    let macros: Macros | null = null;

    // USDA-Lookup (Netzwerkfehler → direkt zum LLM-Fallback)
    try {
      const result = await lookupNutrients(item.name, item.preparation, item.grams);
      if (result) {
        macros = result.macros;
        logCost(result.source, `${item.grams}g ${item.name}`);
      }
    } catch (err) {
      console.warn(`[Nutrition] USDA nicht erreichbar für "${item.name}":`, err);
    }

    // LLM-Fallback wenn USDA keinen Treffer hatte oder nicht erreichbar war
    if (!macros) {
      console.warn(`[Nutrition] LLM-Fallback für "${item.name}"`);
      try {
        macros = await lookupNutrientsViaLLM(item.name, item.grams, item.preparation);
        logCost('llm_fallback', `${item.grams}g ${item.name}`);
        usedLLMFallback = true;
      } catch (llmErr) {
        console.error(`[Nutrition] LLM-Fallback fehlgeschlagen für "${item.name}":`, llmErr);
        continue;
      }
    }

    totals.calories += macros.calories;
    totals.protein  += macros.protein;
    totals.carbs    += macros.carbs;
    totals.fat      += macros.fat;
    resolvedCount++;
  }

  if (resolvedCount === 0) {
    throw new Error(
      'Nährwerte konnten für keines der erkannten Lebensmittel ermittelt werden. ' +
      'Bitte überprüfe deine Internetverbindung und versuche es erneut.',
    );
  }

  const result: FoodAnalysisResponse = {
    name:       items.map(i => i.name).join(', '),
    calories:   Math.round(totals.calories),
    protein:    Math.round(totals.protein  * 10) / 10,
    carbs:      Math.round(totals.carbs    * 10) / 10,
    fat:        Math.round(totals.fat      * 10) / 10,
    confidence: usedLLMFallback ? 0.8 : 1.0,
  };

  console.log(
    `[Nutrition] Gesamt: ${result.calories} kcal | ` +
    `P ${result.protein}g C ${result.carbs}g F ${result.fat}g | ` +
    `Items: ${resolvedCount}/${items.length} aufgelöst`,
  );

  // Cache + Logs asynchron schreiben — blockiert die Antwort nicht
  const userId = await getUserId();
  void setCachedResult(base64_1, result);
  void flushCostLogs(userId);

  return result;
}
