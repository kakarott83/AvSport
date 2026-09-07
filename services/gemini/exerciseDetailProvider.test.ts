/// <reference types="jest" />

/**
 * Unit-Tests: KI-Übungsdetails (Anreicherung der Trainingsplan-Übungen)
 */

import { enrichDaysWithDetails } from '@/services/gemini/exerciseDetailProvider';
import type { GeneratedDay, GeneratedExercise } from '@/types/workout';

jest.mock('@/services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }) },
    from: jest.fn().mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: null }) }),
  },
}));

function makeExercise(name: string): GeneratedExercise {
  return {
    exercise_name: name,
    description: `${name} Beschreibung`,
    muscle_group: 'Beine',
    equipment_type: 'Körpergewicht',
    sets: 3,
    reps: 12,
    target_weight_kg: null,
    target_duration: null,
    rest_seconds: 60,
  };
}

function makeDays(): GeneratedDay[] {
  return [
    {
      day_index: 1,
      label: 'Tag 1',
      warmup: null,
      cooldown: null,
      exercises: [makeExercise('Kniebeuge'), makeExercise('Liegestütze')],
    },
  ];
}

function fullDetail(id: string) {
  return {
    id,
    name_en: 'Barbell Squat',
    short: `Kurzbeschreibung für ${id}`,
    detail_markdown: 'Absatz 1.\n\nAbsatz 2.\n\n- **Atmung**: ein.\n- **Haltung**: gerade.\n- **Häufige Fehler**: keine.',
    instructions: ['Schritt 1 ausführen.', 'Schritt 2 ausführen.', 'Schritt 3 ausführen.'],
    modifications: { beginner: 'Leichter.', advanced: 'Schwerer.' },
    safety: 'Bei Schmerzen abbrechen.',
    tips: ['Tipp 1.', 'Tipp 2.'],
  };
}

function mockFetchOnce(json: unknown) {
  (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
    }),
  });
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';
});

afterAll(() => {
  delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('enrichDaysWithDetails — KI-Erfolg', () => {
  it('übernimmt alle Detailfelder aus der KI-Antwort', async () => {
    mockFetchOnce({ exercises: [fullDetail('d1-e0'), fullDetail('d1-e1')] });

    const days = await enrichDaysWithDetails(makeDays());
    const [ex1, ex2] = days[0].exercises;

    expect(ex1.short).toBe('Kurzbeschreibung für d1-e0');
    expect(ex1.name_en).toBe('Barbell Squat');
    expect(ex1.instructions).toHaveLength(3);
    expect(ex1.modifications).toEqual({ beginner: 'Leichter.', advanced: 'Schwerer.' });
    expect(ex1.safety).toBe('Bei Schmerzen abbrechen.');
    expect(ex1.tips).toHaveLength(2);
    expect(ex1.video_url).toBeNull();
    expect(ex2.short).toBe('Kurzbeschreibung für d1-e1');
  });

  it('akzeptiert die Übung auch ohne name_en (fällt auf "" zurück)', async () => {
    const detail = fullDetail('d1-e0');
    delete (detail as { name_en?: string }).name_en;
    mockFetchOnce({ exercises: [detail, fullDetail('d1-e1')] });

    const days = await enrichDaysWithDetails(makeDays());
    expect(days[0].exercises[0].name_en).toBe('');
    expect(days[0].exercises[0].short).toBe('Kurzbeschreibung für d1-e0');
  });

  it('behält alle ursprünglichen Feldwerte der Übung bei', async () => {
    mockFetchOnce({ exercises: [fullDetail('d1-e0'), fullDetail('d1-e1')] });

    const days = await enrichDaysWithDetails(makeDays());
    expect(days[0].exercises[0].exercise_name).toBe('Kniebeuge');
    expect(days[0].exercises[0].sets).toBe(3);
  });
});

describe('enrichDaysWithDetails — Teil-Fallback', () => {
  it('nutzt lokalen Fallback nur für die fehlende Übung', async () => {
    mockFetchOnce({ exercises: [fullDetail('d1-e0')] }); // d1-e1 fehlt in der Antwort

    const days = await enrichDaysWithDetails(makeDays());
    const [ex1, ex2] = days[0].exercises;

    expect(ex1.short).toBe('Kurzbeschreibung für d1-e0');
    expect(ex2.short).toBeTruthy();
    expect(ex2.short).not.toBe('Kurzbeschreibung für d1-e1');
    expect(ex2.instructions?.length).toBeGreaterThan(0);
  });

  it('nutzt lokalen Fallback für eine Übung mit unvollständigen Feldern', async () => {
    mockFetchOnce({
      exercises: [
        fullDetail('d1-e0'),
        { id: 'd1-e1', short: 'zu kurz' /* restliche Felder fehlen */ },
      ],
    });

    const days = await enrichDaysWithDetails(makeDays());
    expect(days[0].exercises[1].safety).toBeTruthy();
    expect(days[0].exercises[1].tips?.length).toBeGreaterThan(0);
  });
});

describe('enrichDaysWithDetails — Vollständiger Fallback', () => {
  it('generiert für alle Übungen lokale Details bei Netzwerkfehler', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('Network Error'));

    const days = await enrichDaysWithDetails(makeDays());
    for (const ex of days[0].exercises) {
      expect(ex.short).toBeTruthy();
      expect(ex.detail_markdown).toBeTruthy();
      expect(ex.instructions?.length).toBeGreaterThan(0);
      expect(ex.modifications?.beginner).toBeTruthy();
      expect(ex.safety).toBeTruthy();
      expect(ex.tips?.length).toBeGreaterThan(0);
      expect(ex.video_url).toBeNull();
    }
  });

  it('generiert lokale Details bei ungültigem JSON', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'kein json' }] } }] }),
    });

    const days = await enrichDaysWithDetails(makeDays());
    expect(days[0].exercises.every((ex) => !!ex.short)).toBe(true);
  });

  it('wirft nie, auch wenn der Gemini-Call komplett fehlschlägt', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'Server Error' });
    await expect(enrichDaysWithDetails(makeDays())).resolves.toBeDefined();
  });

  it('gibt leere Tage unverändert zurück, ohne Gemini aufzurufen', async () => {
    const fetchMock = jest.fn();
    (globalThis.fetch as jest.Mock) = fetchMock;

    const days = await enrichDaysWithDetails([]);
    expect(days).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
