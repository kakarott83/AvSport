import { recognizeFoodItems, type RecognizedItem } from '@/services/nutrition/foodRecognition';
import { lookupNutrients }               from '@/services/nutrition/usdaLookup';
import { lookupNutrientsViaLLM }         from './nutritionFallback';
import { GeminiDailyLimitError }         from './client';
import { getCachedResult, setCachedResult } from '@/services/nutrition/nutritionCache';
import { supabase }                      from '@/services/supabaseClient';
import type { Macros }                   from '@/services/nutrition/usdaLookup';

// ── Öffentliches Interface (bleibt identisch → FoodScanner.tsx unverändert) ──

export interface AnalyzedItem {
  name:     string; // Deutscher Anzeigename
  grams:    number;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

export interface FoodAnalysisResponse {
  name:          string;
  calories:      number;
  protein:       number;
  carbs:         number;
  fat:           number;
  confidence:    number;
  items:         AnalyzedItem[];
  health_notes?: string;
}

/** Optionale Zusatzinfos aus der Foto-Erkennung. */
export interface MealMeta {
  meal_name?:    string;
  health_notes?: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

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
  const { items, meal_name, health_notes } = await recognizeFoodItems(base64_1, base64_2, notes);

  // ── Schritt 2: Nährwerte für die erkannte Liste ───────────────────────────
  const result = await analyzeFoodItems(items, { meal_name, health_notes });

  // Cache asynchron schreiben — blockiert die Antwort nicht
  void setCachedResult(base64_1, result);
  return result;
}

/**
 * Nährwert-Kette (USDA → USDA ohne Zubereitung → LLM) für eine Item-Liste.
 * Wird vom Foto-Flow und direkt von der Text-Erfassung (bearbeitete Liste)
 * genutzt. Items ohne englischen Namen (umbenannt / neu angelegt) gehen
 * direkt an den LLM-Fallback mit dem deutschen Namen.
 */
export async function analyzeFoodItems(
  items: RecognizedItem[],
  meta: MealMeta = {},
): Promise<FoodAnalysisResponse> {
  const totals: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const analyzed: AnalyzedItem[] = [];
  let usedLLMFallback  = false;
  let resolvedCount    = 0;

  for (const item of items) {
    let macros: Macros | null = null;

    // USDA-Lookup (Netzwerkfehler → direkt zum LLM-Fallback). Braucht den
    // englischen Namen — fehlt der, weil der Nutzer das Item umbenannt hat,
    // übernimmt direkt der LLM-Fallback.
    if (item.name) {
      try {
        const result = await lookupNutrients(item.name, item.preparation, item.grams);
        if (result) {
          macros = result.macros;
          logCost(result.source, `${item.grams}g ${item.name}`);
        }
      } catch (err) {
        console.warn(`[Nutrition] USDA nicht erreichbar für "${item.name}":`, err);
      }
    }

    // LLM-Fallback wenn USDA keinen Treffer hatte oder nicht erreichbar war
    if (!macros) {
      console.warn(`[Nutrition] LLM-Fallback für "${item.name || item.name_de}"`);
      try {
        const llmName = item.name || item.name_de;
        macros = await lookupNutrientsViaLLM(llmName, item.grams, item.preparation);
        logCost('llm_fallback', `${item.grams}g ${llmName}`);
        usedLLMFallback = true;
      } catch (llmErr) {
        if (llmErr instanceof GeminiDailyLimitError) throw llmErr;
        console.error(`[Nutrition] LLM-Fallback fehlgeschlagen für "${item.name}":`, llmErr);
        continue;
      }
    }

    totals.calories += macros.calories;
    totals.protein  += macros.protein;
    totals.carbs    += macros.carbs;
    totals.fat      += macros.fat;
    analyzed.push({
      name:     item.name_de || item.name,
      grams:    Math.round(item.grams),
      calories: Math.round(macros.calories),
      protein:  round1(macros.protein),
      carbs:    round1(macros.carbs),
      fat:      round1(macros.fat),
    });
    resolvedCount++;
  }

  if (resolvedCount === 0) {
    throw new Error(
      'Nährwerte konnten für keines der erkannten Lebensmittel ermittelt werden. ' +
      'Bitte überprüfe deine Internetverbindung und versuche es erneut.',
    );
  }

  const result: FoodAnalysisResponse = {
    name:         meta.meal_name || items.map(i => i.name_de).join(', '),
    calories:     Math.round(totals.calories),
    protein:      round1(totals.protein),
    carbs:        round1(totals.carbs),
    fat:          round1(totals.fat),
    confidence:   usedLLMFallback ? 0.8 : 1.0,
    items:        analyzed,
    health_notes: meta.health_notes,
  };

  console.log(
    `[Nutrition] Gesamt: ${result.calories} kcal | ` +
    `P ${result.protein}g C ${result.carbs}g F ${result.fat}g | ` +
    `Items: ${resolvedCount}/${items.length} aufgelöst`,
  );

  const userId = await getUserId();
  void flushCostLogs(userId);
  return result;
}
