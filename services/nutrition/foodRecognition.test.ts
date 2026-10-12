jest.mock('@/services/gemini/client', () => ({ geminiRequest: jest.fn() }));

import { geminiRequest } from '@/services/gemini/client';
import { recognizeFoodFromText } from './foodRecognition';

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
    expect(items.map((i) => i.name_de)).toEqual(['Vollkornbrot', 'Apfel']);
    expect(items[1].grams).toBe(180);
  });

  it('wirft eine verständliche Meldung, wenn kein Essen erkannt wurde', async () => {
    mockGemini.mockResolvedValue('{"items":[]}');
    await expect(recognizeFoodFromText('Hallo')).rejects.toThrow('In deiner Beschreibung wurde kein Essen erkannt');
  });
});
