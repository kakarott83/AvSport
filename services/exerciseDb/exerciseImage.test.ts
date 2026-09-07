/// <reference types="jest" />

/**
 * Unit-Tests: Übungs-Frames gegen die free-exercise-db
 */

import AsyncStorageMock from '@react-native-async-storage/async-storage';

import { __resetImageCacheForTests, fetchExerciseFrames } from './exerciseImage';

const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';

const DB = [
  { name: 'Barbell Full Squat', images: ['Barbell_Full_Squat/0.jpg', 'Barbell_Full_Squat/1.jpg'] },
  { name: 'Bodyweight Squat', images: ['Bodyweight_Squat/0.jpg', 'Bodyweight_Squat/1.jpg'] },
  { name: 'Push-Up', images: ['Push-Up/0.jpg', 'Push-Up/1.jpg'] },
  { name: 'Plank', images: ['Plank/0.jpg'] },
  { name: 'No Image Exercise', images: [] },
];

function mockDbFetch(payload: unknown = DB, ok = true) {
  (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorageMock as unknown as { __reset(): void }).__reset();
  __resetImageCacheForTests();
});

describe('fetchExerciseFrames', () => {
  it('liefert beide Positions-Frames als volle CDN-URLs (exakter Name)', async () => {
    mockDbFetch();
    await expect(fetchExerciseFrames('Plank', 'Unterarmstütz')).resolves.toEqual([`${CDN}Plank/0.jpg`]);
  });

  it('liefert 2 Frames für eine Übung mit Start-/Endbild', async () => {
    mockDbFetch();
    await expect(fetchExerciseFrames('Push-Up')).resolves.toEqual([
      `${CDN}Push-Up/0.jpg`,
      `${CDN}Push-Up/1.jpg`,
    ]);
  });

  it('findet über Token-Overlap den generischsten Treffer', async () => {
    mockDbFetch();
    await expect(fetchExerciseFrames('Squat')).resolves.toEqual([
      `${CDN}Bodyweight_Squat/0.jpg`,
      `${CDN}Bodyweight_Squat/1.jpg`,
    ]);
  });

  it('nutzt den deutschen Namen, wenn der englische nichts trifft', async () => {
    mockDbFetch([{ name: 'Plank', images: ['Plank/0.jpg'] }]);
    await expect(fetchExerciseFrames('Xyzzy Move', 'Plank')).resolves.toEqual([`${CDN}Plank/0.jpg`]);
  });

  it('gibt [] zurück, wenn nichts passt', async () => {
    mockDbFetch();
    await expect(fetchExerciseFrames('Völlig Unbekannt', 'Auch Unbekannt')).resolves.toEqual([]);
  });

  it('ignoriert Einträge ohne Bild', async () => {
    mockDbFetch([{ name: 'No Image Exercise', images: [] }]);
    await expect(fetchExerciseFrames('No Image Exercise')).resolves.toEqual([]);
  });

  it('lädt die DB nur einmal und cacht das Ergebnis pro Übung', async () => {
    mockDbFetch();

    await fetchExerciseFrames('Plank');
    await fetchExerciseFrames('Plank');
    await fetchExerciseFrames('Push-Up');

    expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('persistiert die DB in AsyncStorage und nutzt sie ohne erneuten fetch', async () => {
    mockDbFetch();
    await fetchExerciseFrames('Plank');
    expect(AsyncStorageMock.setItem).toHaveBeenCalledTimes(1);

    __resetImageCacheForTests();
    (globalThis.fetch as jest.Mock).mockClear();

    await expect(fetchExerciseFrames('Push-Up')).resolves.toHaveLength(2);
    expect(globalThis.fetch as jest.Mock).not.toHaveBeenCalled();
  });

  it('wirft nie bei Netzwerkfehlern', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(fetchExerciseFrames('Plank')).resolves.toEqual([]);
  });

  it('darf nach einem Fehlversuch erneut laden', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockRejectedValueOnce(new Error('offline'));
    await expect(fetchExerciseFrames('Plank')).resolves.toEqual([]);

    mockDbFetch();
    await expect(fetchExerciseFrames('Push-Up')).resolves.toHaveLength(2);
  });

  it('gibt bei leeren Namen sofort [] zurück, ohne Laden', async () => {
    const fetchMock = jest.fn();
    (globalThis.fetch as jest.Mock) = fetchMock;

    await expect(fetchExerciseFrames(null, '  ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
