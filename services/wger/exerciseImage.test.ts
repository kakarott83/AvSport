/// <reference types="jest" />

/**
 * Unit-Tests: wger-Übungsbildsuche
 */

import { fetchExerciseImage } from '@/services/wger/exerciseImage';

function mockFetch(impl: (url: string) => unknown) {
  (globalThis.fetch as jest.Mock) = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => impl(url),
  }));
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('fetchExerciseImage', () => {
  it('liefert das Hauptbild des ersten Treffers', async () => {
    mockFetch(() => ({
      results: [
        { images: [{ image: 'https://wger.de/a.png', is_main: false }, { image: 'https://wger.de/main.png', is_main: true }] },
      ],
    }));

    await expect(fetchExerciseImage('Bankdrücken')).resolves.toBe('https://wger.de/main.png');
  });

  it('überspringt Treffer ohne Bild und nimmt den nächsten', async () => {
    mockFetch(() => ({
      results: [
        { images: [] },
        { images: [{ image: 'https://wger.de/second.png' }] },
      ],
    }));

    await expect(fetchExerciseImage('Klimmzug')).resolves.toBe('https://wger.de/second.png');
  });

  it('fällt bei leerem deutschen Ergebnis auf die englische Suche zurück', async () => {
    mockFetch((url) =>
      url.includes('language__code=de')
        ? { results: [] }
        : { results: [{ images: [{ image: 'https://wger.de/en.png', is_main: true }] }] },
    );

    await expect(fetchExerciseImage('Ausfallschritt')).resolves.toBe('https://wger.de/en.png');
    expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('gibt null zurück, wenn kein Treffer ein Bild hat', async () => {
    mockFetch(() => ({ results: [{ images: [] }] }));
    await expect(fetchExerciseImage('Unbekannte Übung XYZ')).resolves.toBeNull();
  });

  it('wirft nie bei Netzwerkfehlern', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('Network Error'));
    await expect(fetchExerciseImage('Kreuzheben')).resolves.toBeNull();
  });

  it('cacht das Ergebnis und fragt dieselbe Übung nur einmal an', async () => {
    mockFetch(() => ({ results: [{ images: [{ image: 'https://wger.de/cached.png', is_main: true }] }] }));

    await fetchExerciseImage('Schulterdrücken');
    await fetchExerciseImage('  schulterdrücken  ');

    expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('fragt bei leerem Namen gar nicht an', async () => {
    const fetchMock = jest.fn();
    (globalThis.fetch as jest.Mock) = fetchMock;

    await expect(fetchExerciseImage('   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
