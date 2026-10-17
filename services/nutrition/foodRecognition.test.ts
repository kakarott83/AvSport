jest.mock('@/services/gemini/client', () => ({ geminiRequest: jest.fn() }));

import { geminiRequest } from '@/services/gemini/client';
import { recognizeFoodFromText, recognizeFoodItems } from './foodRecognition';

const mockGemini = geminiRequest as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('recognizeFoodFromText', () => {
  it('schickt die Beschreibung als reinen Text-Prompt und liefert die Items', async () => {
    mockGemini.mockResolvedValue(JSON.stringify({
      items: [
        { name: 'whole wheat bread', name_de: 'Vollkornbrot', grams: 100, preparation: 'baked' },
        { name: 'apple', name_de: 'Apfel', grams: 180, preparation: 'raw' },
      ],
    }));

    const { items } = await recognizeFoodFromText('Zwei Scheiben Vollkornbrot und ein Apfel');

    const parts = mockGemini.mock.calls[0][0];
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toContain('Zwei Scheiben Vollkornbrot und ein Apfel');
    // Gerichte bleiben ein Item, da jedes Item ein eigener Journal-Eintrag wird
    expect(parts[0].text).toContain('do not split it into ingredients');
    expect(items.map((i) => i.name_de)).toEqual(['Vollkornbrot', 'Apfel']);
    expect(items[1].grams).toBe(180);
  });

  it('wirft eine verständliche Meldung, wenn kein Essen erkannt wurde', async () => {
    mockGemini.mockResolvedValue('{"items":[]}');
    await expect(recognizeFoodFromText('Hallo')).rejects.toThrow('In deiner Beschreibung wurde kein Essen erkannt');
  });
});

describe('recognizeFoodItems (Foto)', () => {
  it('liefert Items plus meal_name und health_notes', async () => {
    mockGemini.mockResolvedValue(JSON.stringify({
      meal_name: 'Hähnchen mit Reis',
      health_notes: 'Exzellente Proteinquelle.',
      items: [{ name: 'chicken breast', name_de: 'Hähnchenbrust', grams: 150, preparation: 'grilled' }],
    }));

    const r = await recognizeFoodItems('img');

    expect(mockGemini.mock.calls[0][0][0].text).toContain('meal_name');
    expect(r.meal_name).toBe('Hähnchen mit Reis');
    expect(r.health_notes).toBe('Exzellente Proteinquelle.');
    expect(r.items[0].name_de).toBe('Hähnchenbrust');
  });

  it('wirft die Fehlermeldung der KI, wenn kein Essen auf dem Foto ist', async () => {
    mockGemini.mockResolvedValue('{"error":"Konnte keine Lebensmittel auf dem Bild erkennen."}');
    await expect(recognizeFoodItems('img')).rejects.toThrow('Konnte keine Lebensmittel auf dem Bild erkennen.');
  });

  it('lässt fehlende Zusatzfelder weg', async () => {
    mockGemini.mockResolvedValue(JSON.stringify({
      items: [{ name: 'apple', name_de: 'Apfel', grams: 180, preparation: 'raw' }],
    }));
    const r = await recognizeFoodItems('img');
    expect(r.meal_name).toBeUndefined();
    expect(r.health_notes).toBeUndefined();
  });
});
