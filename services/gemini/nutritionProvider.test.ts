/**
 * Unit-Tests: analyzeFoodImage (nutritionProvider)
 *
 * Prüft die dreistufige Auflösungskette:
 *   Cache-Treffer → USDA-Erfolg → USDA-Fallback → LLM-Fallback
 * sowie Kosten-Logging in nutrition_cost_logs, Rundung und Fehlerverhalten.
 */

// ── Mocks (vor allen Imports) ─────────────────────────────────────────────────

jest.mock('@/services/supabaseClient');
jest.mock('@/services/nutrition/foodRecognition');
jest.mock('@/services/nutrition/usdaLookup');
jest.mock('./nutritionFallback');
jest.mock('@/services/nutrition/nutritionCache');

// ── Imports ───────────────────────────────────────────────────────────────────

import { analyzeFoodImage }                from './nutritionProvider';
import { supabase }                        from '@/services/supabaseClient';
import { recognizeFoodItems }              from '@/services/nutrition/foodRecognition';
import { lookupNutrients }                 from '@/services/nutrition/usdaLookup';
import { lookupNutrientsViaLLM }           from './nutritionFallback';
import { getCachedResult, setCachedResult } from '@/services/nutrition/nutritionCache';

// ── Typ-Casts ─────────────────────────────────────────────────────────────────

const mockRecognize = recognizeFoodItems    as jest.Mock;
const mockLookup    = lookupNutrients       as jest.Mock;
const mockLLM       = lookupNutrientsViaLLM as jest.Mock;
const mockGetCache  = getCachedResult       as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ITEM_APPLE = { name: 'apple', name_de: 'Apfel', preparation: null,     grams: 182 };
const ITEM_RICE  = { name: 'rice',  name_de: 'Reis',  preparation: 'cooked', grams: 150 };

const MACROS_APPLE = { calories: 95,  protein: 0.5, carbs: 25.0, fat: 0.3 };
const MACROS_RICE  = { calories: 206, protein: 4.3, carbs: 44.5, fat: 0.4 };

const CACHED_RESPONSE = {
  name: 'apple', calories: 95, protein: 0.5, carbs: 25.0, fat: 0.3, confidence: 1.0,
};

// ── Hilfsfunktion ─────────────────────────────────────────────────────────────

/** Drei Mikrotask-Ticks leeren, damit fire-and-forget async-Aufrufe abgeschlossen sind. */
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// ── Setup ─────────────────────────────────────────────────────────────────────

let insertMock: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();

  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  mockGetCache.mockResolvedValue(null);
  (setCachedResult as jest.Mock).mockResolvedValue(undefined);

  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'user-123' } },
  });
  insertMock = jest.fn().mockResolvedValue({ error: null });
  (supabase.from as jest.Mock).mockReturnValue({ insert: insertMock });
});

afterEach(async () => {
  await flush(); // pendingLogs zwischen Tests leeren
});

// ── 1. Cache-Treffer ──────────────────────────────────────────────────────────

describe('Cache-Treffer', () => {
  beforeEach(() => {
    mockGetCache.mockResolvedValue(CACHED_RESPONSE);
  });

  it('gibt die gecachte Antwort zurück', async () => {
    const result = await analyzeFoodImage('b64abc');
    expect(result).toEqual(CACHED_RESPONSE);
  });

  it('ruft recognizeFoodItems nicht auf', async () => {
    await analyzeFoodImage('b64abc');
    expect(mockRecognize).not.toHaveBeenCalled();
  });

  it('schreibt cache_hit mit korrekter user_id in nutrition_cost_logs', async () => {
    await analyzeFoodImage('b64abc');
    await flush();

    expect(supabase.from).toHaveBeenCalledWith('nutrition_cost_logs');
    const rows: { call_type: string; user_id: string }[] = insertMock.mock.calls[0][0];
    expect(rows).toEqual([
      expect.objectContaining({ call_type: 'cache_hit', user_id: 'user-123' }),
    ]);
  });
});

// ── 2. USDA-Erfolg ────────────────────────────────────────────────────────────

describe('USDA-Erfolg', () => {
  beforeEach(() => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE, ITEM_RICE] });
    mockLookup
      .mockResolvedValueOnce({ macros: MACROS_APPLE, source: 'usda' })
      .mockResolvedValueOnce({ macros: MACROS_RICE,  source: 'usda' });
  });

  it('summiert Kalorien und rundet auf ganze Zahlen', async () => {
    const r = await analyzeFoodImage('img');
    expect(r.calories).toBe(301); // Math.round(95 + 206)
  });

  it('summiert Makros und rundet auf eine Dezimalstelle', async () => {
    const r = await analyzeFoodImage('img');
    expect(r.protein).toBe(4.8);  // Math.round((0.5 + 4.3) * 10) / 10
    expect(r.carbs).toBe(69.5);   // Math.round((25.0 + 44.5) * 10) / 10
    expect(r.fat).toBe(0.7);      // Math.round((0.3 + 0.4) * 10) / 10
  });

  it('setzt confidence 1.0', async () => {
    const r = await analyzeFoodImage('img');
    expect(r.confidence).toBe(1.0);
  });

  it('verbindet deutsche Item-Namen mit Komma', async () => {
    const r = await analyzeFoodImage('img');
    expect(r.name).toBe('Apfel, Reis');
  });

  it('schreibt usda-Einträge für alle Items in nutrition_cost_logs', async () => {
    await analyzeFoodImage('img');
    await flush();

    const rows: { call_type: string; user_id: string }[] = insertMock.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.call_type === 'usda')).toBe(true);
    expect(rows.every(r => r.user_id === 'user-123')).toBe(true);
  });
});

// ── 3. USDA-Fallback ─────────────────────────────────────────────────────────

describe('USDA-Fallback (usda_fallback)', () => {
  it('behält confidence 1.0 und loggt usda_fallback', async () => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockResolvedValue({ macros: MACROS_APPLE, source: 'usda_fallback' });

    const r = await analyzeFoodImage('img');
    expect(r.confidence).toBe(1.0);

    await flush();
    const rows: { call_type: string }[] = insertMock.mock.calls[0][0];
    expect(rows[0].call_type).toBe('usda_fallback');
  });
});

// ── 4. LLM-Fallback ──────────────────────────────────────────────────────────

describe('LLM-Fallback', () => {
  beforeEach(() => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockResolvedValue(null); // USDA kein Treffer
    mockLLM.mockResolvedValue(MACROS_APPLE);
  });

  it('ruft lookupNutrientsViaLLM mit korrekten Parametern auf', async () => {
    await analyzeFoodImage('img');
    expect(mockLLM).toHaveBeenCalledWith(
      ITEM_APPLE.name, ITEM_APPLE.grams, ITEM_APPLE.preparation,
    );
  });

  it('gibt confidence 0.8 zurück', async () => {
    const r = await analyzeFoodImage('img');
    expect(r.confidence).toBe(0.8);
  });

  it('übernimmt die LLM-Makros korrekt', async () => {
    const r = await analyzeFoodImage('img');
    expect(r.calories).toBe(95);
    expect(r.protein).toBe(0.5);
  });

  it('loggt llm_fallback in nutrition_cost_logs', async () => {
    await analyzeFoodImage('img');
    await flush();

    const rows: { call_type: string }[] = insertMock.mock.calls[0][0];
    expect(rows[0].call_type).toBe('llm_fallback');
  });
});

// ── 5. Netzwerkfehler bei USDA ───────────────────────────────────────────────

describe('Netzwerkfehler bei USDA', () => {
  it('fällt auf LLM zurück wenn lookupNutrients eine Exception wirft', async () => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockRejectedValue(new Error('Network timeout'));
    mockLLM.mockResolvedValue(MACROS_APPLE);

    const r = await analyzeFoodImage('img');

    expect(mockLLM).toHaveBeenCalled();
    expect(r.confidence).toBe(0.8);
    expect(r.calories).toBe(95);
  });
});

// ── 6. Gemischte Auflösung (USDA + LLM) ──────────────────────────────────────

describe('Gemischte Auflösung', () => {
  it('setzt confidence 0.8 wenn mindestens ein Item über LLM aufgelöst wurde', async () => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE, ITEM_RICE] });
    mockLookup
      .mockResolvedValueOnce({ macros: MACROS_APPLE, source: 'usda' })
      .mockResolvedValueOnce(null);
    mockLLM.mockResolvedValue(MACROS_RICE);

    const r = await analyzeFoodImage('img');
    expect(r.confidence).toBe(0.8);
    expect(r.calories).toBe(301); // 95 + 206
  });
});

// ── 7. Alle Items fehlgeschlagen ──────────────────────────────────────────────

describe('Alle Items fehlgeschlagen', () => {
  it('wirft wenn weder USDA noch LLM ein Item auflösen konnte', async () => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockResolvedValue(null);
    mockLLM.mockRejectedValue(new Error('LLM nicht verfügbar'));

    await expect(analyzeFoodImage('img')).rejects.toThrow(
      'Nährwerte konnten für keines der erkannten Lebensmittel ermittelt werden',
    );
  });

  it('überspringt fehlgeschlagene Items und wirft nur wenn alle scheitern', async () => {
    // Item 1: LLM-Fehler → skip; Item 2: USDA-Erfolg → zählt
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE, ITEM_RICE] });
    mockLookup
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ macros: MACROS_RICE, source: 'usda' });
    mockLLM.mockRejectedValue(new Error('LLM Fehler'));

    const r = await analyzeFoodImage('img');
    expect(r.calories).toBe(206);
    expect(r.confidence).toBe(1.0); // LLM nicht verwendet (skip, nicht Fallback)
  });
});

// ── 8. Kein eingeloggter Nutzer ───────────────────────────────────────────────

describe('Kein eingeloggter Nutzer', () => {
  it('schreibt null als user_id in nutrition_cost_logs', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null } });
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockResolvedValue({ macros: MACROS_APPLE, source: 'usda' });

    await analyzeFoodImage('img');
    await flush();

    const rows: { user_id: string | null }[] = insertMock.mock.calls[0][0];
    expect(rows[0].user_id).toBeNull();
  });
});

// ── 9. Supabase-Fehler beim Insert ────────────────────────────────────────────

describe('Supabase-Insert-Fehler', () => {
  it('gibt das Analyseergebnis trotz DB-Fehler zurück', async () => {
    insertMock.mockResolvedValue({ error: { message: 'DB-Fehler' } });
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockResolvedValue({ macros: MACROS_APPLE, source: 'usda' });

    const r = await analyzeFoodImage('img');
    expect(r.calories).toBe(95);
  });
});

// ── 10. Rundungslogik ─────────────────────────────────────────────────────────

describe('Rundungslogik', () => {
  it('rundet Kalorien auf ganze Zahlen (Math.round)', async () => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockResolvedValue({
      macros: { calories: 95.7, protein: 0.5, carbs: 25.0, fat: 0.3 },
      source: 'usda',
    });

    const r = await analyzeFoodImage('img');
    expect(r.calories).toBe(96);
  });

  it('rundet Makros auf eine Dezimalstelle', async () => {
    mockRecognize.mockResolvedValue({ items: [ITEM_APPLE] });
    mockLookup.mockResolvedValue({
      macros: { calories: 100, protein: 4.35, carbs: 25.45, fat: 1.35 },
      source: 'usda',
    });

    const r = await analyzeFoodImage('img');
    expect(r.protein).toBe(4.4);  // Math.round(4.35 * 10) / 10
    expect(r.carbs).toBe(25.5);   // Math.round(25.45 * 10) / 10
    expect(r.fat).toBe(1.4);      // Math.round(1.35 * 10) / 10
  });
});
