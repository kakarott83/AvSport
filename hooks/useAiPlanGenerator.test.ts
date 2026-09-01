/// <reference types="jest" />

/**
 * Unit-Tests: KI-Trainingsplan-Generator
 * Testet Mapping, Fallback und Daten-Struktur für workout_plans (Multi-Tage-Split).
 */

import { generateAiPlan } from '@/services/gemini/aiTrainingService';
import type { AiPlanInput } from '@/types/workout';

// ─── Supabase-Mock (verhindert "supabaseUrl is required" beim Import) ─────────
jest.mock('@/services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }) },
    from:  jest.fn().mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: null }) }),
  },
}));

// ─── Fetch-Mock ───────────────────────────────────────────────────────────────

const MOCK_EXERCISES = [
  { exercise_name: 'Kniebeugen',  sets: 4, reps: 12, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
  { exercise_name: 'Liegestütze', sets: 3, reps: 15, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
  { exercise_name: 'Plank',       sets: 3, reps: 1,  target_weight_kg: null, target_duration: 45,   rest_seconds: 30 },
];

function makeDay(day_index: number) {
  return {
    day_index, label: `Tag ${day_index}`, warmup: 'Mobilisation', cooldown: 'Dehnen',
    exercises: MOCK_EXERCISES,
  };
}

function makeGeminiResponse(title: string, is_circuit: boolean, dayCount = 3) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              title,
              is_circuit,
              progression_notes: 'Steigere wöchentlich Gewicht oder Wiederholungen.',
              days: Array.from({ length: dayCount }, (_, i) => makeDay(i + 1)),
            }),
          }],
        },
      }],
    }),
  };
}

function makeFailResponse(status = 500) {
  return { ok: false, status, text: async () => 'Server Error' };
}

beforeAll(() => {
  // Env-Var muss gesetzt sein, sonst wirft callGemini vor dem fetch-Aufruf
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';
});

afterAll(() => {
  delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
});

beforeEach(() => {
  jest.resetAllMocks();
});

// ─── Hilfsfunktion ────────────────────────────────────────────────────────────

const BASE_INPUT: AiPlanInput = {
  goal:            'muskeln',
  focusArea:       'beine',
  targetWeeks:     8,
  scheduledDays:   [1, 3, 5], // Mo, Mi, Fr → 3 Split-Tage
  environment:     'gym',
  equipment:       [],
  sessionMinutes:  45,
  fitnessLevel:    'fortgeschritten',
  restrictions:    null,
};

function allExercises(plan: Awaited<ReturnType<typeof generateAiPlan>>) {
  return plan.days.flatMap((d) => d.exercises);
}

// ─── Erfolgreicher API-Call ───────────────────────────────────────────────────

describe('generateAiPlan — API-Erfolg', () => {
  beforeEach(() => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue(
      makeGeminiResponse('Starker Beine-Plan', false),
    );
  });

  it('übernimmt den KI-Titel', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.title).toBe('Starker Beine-Plan');
  });

  it('setzt is_ai_generated = true', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.is_ai_generated).toBe(true);
  });

  it('mappt focus_area, fitness_goal, target_weeks korrekt', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.focus_area).toBe('beine');
    expect(plan.fitness_goal).toBe('muskeln');
    expect(plan.target_weeks).toBe(8);
  });

  it('mappt environment, equipment, Dauer und Fitnesslevel aus der Eingabe', async () => {
    const plan = await generateAiPlan({ ...BASE_INPUT, environment: 'home', equipment: ['Kurzhanteln'] });
    expect(plan.environment).toBe('home');
    expect(plan.equipment).toEqual(['Kurzhanteln']);
    expect(plan.estimated_duration_minutes).toBe(45);
    expect(plan.fitness_level).toBe('fortgeschritten');
  });

  it('leert equipment wenn environment "gym" ist', async () => {
    const plan = await generateAiPlan({ ...BASE_INPUT, environment: 'gym', equipment: ['Kurzhanteln'] });
    expect(plan.equipment).toEqual([]);
  });

  it('übernimmt Einschränkungen', async () => {
    const plan = await generateAiPlan({ ...BASE_INPUT, restrictions: 'Knieprobleme' });
    expect(plan.restrictions).toBe('Knieprobleme');
  });

  it('übernimmt scheduled_days aus der Eingabe', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.scheduled_days).toEqual([1, 3, 5]);
  });

  it('setzt scheduled_days auf null wenn keine Tage gewählt', async () => {
    const plan = await generateAiPlan({ ...BASE_INPUT, scheduledDays: [] });
    expect(plan.scheduled_days).toBeNull();
  });

  it('übernimmt die Tage samt Übungen aus der KI-Antwort', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.days).toHaveLength(3);
    expect(plan.days[0].day_index).toBe(1);
    expect(plan.days[0].exercises).toHaveLength(MOCK_EXERCISES.length);
    expect(plan.days[0].exercises[0].exercise_name).toBe('Kniebeugen');
  });

  it('übernimmt progression_notes', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.progression_notes).toBe('Steigere wöchentlich Gewicht oder Wiederholungen.');
  });

  it('übernimmt is_circuit aus der KI-Antwort', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      makeGeminiResponse('Zirkel-Plan', true),
    );
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.is_circuit).toBe(true);
  });
});

// ─── Fallback bei API-Fehler ──────────────────────────────────────────────────

describe('generateAiPlan — Fallback', () => {
  it('gibt Fallback-Plan zurück wenn API 500 liefert', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue(makeFailResponse(500));
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.is_ai_generated).toBe(true);
    expect(plan.days.length).toBeGreaterThan(0);
    expect(allExercises(plan).length).toBeGreaterThan(0);
  });

  it('gibt Fallback-Plan zurück wenn fetch wirft', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('Network Error'));
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.is_ai_generated).toBe(true);
    expect(allExercises(plan).length).toBeGreaterThan(0);
  });

  it('gibt Fallback-Plan zurück bei ungültigem JSON', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'kein json hier' }] } }],
      }),
    });
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan.is_ai_generated).toBe(true);
    expect(allExercises(plan).length).toBeGreaterThan(0);
  });

  it('gibt Fallback-Plan zurück wenn KI leere days liefert', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ title: 'Leer', is_circuit: false, days: [] }) }],
          },
        }],
      }),
    });
    const plan = await generateAiPlan(BASE_INPUT);
    expect(allExercises(plan).length).toBeGreaterThan(0);
  });

  it('Fallback berücksichtigt "nur Körpergewicht" bei Zuhause ohne Geräte', async () => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('Network Error'));
    const plan = await generateAiPlan({ ...BASE_INPUT, environment: 'home', equipment: [] });
    for (const ex of allExercises(plan)) {
      expect(ex.target_weight_kg).toBeNull();
    }
  });
});

// ─── Scheduled-Days-Mapping ───────────────────────────────────────────────────

describe('generateAiPlan — scheduled_days Mapping', () => {
  beforeEach(() => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue(
      makeGeminiResponse('Plan', false),
    );
  });

  it.each([
    [[1, 3, 5],    [1, 3, 5]],  // Mo, Mi, Fr
    [[0, 6],       [0, 6]],     // So, Sa
    [[1, 2, 3, 4], [1, 2, 3, 4]],
    [[],           null],
  ] as const)(
    'scheduledDays %j → scheduled_days %j',
    async (input, expected) => {
      const plan = await generateAiPlan({ ...BASE_INPUT, scheduledDays: [...input] });
      expect(plan.scheduled_days).toEqual(expected);
    },
  );
});

// ─── Workout-Plans-Struktur ───────────────────────────────────────────────────

describe('generateAiPlan — workout_plans Struktur', () => {
  beforeEach(() => {
    (globalThis.fetch as jest.Mock) = jest.fn().mockResolvedValue(
      makeGeminiResponse('Test Plan', false),
    );
  });

  it('alle Pflichtfelder für workout_plans sind vorhanden', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    expect(plan).toMatchObject({
      is_ai_generated:              true,
      focus_area:                   expect.any(String),
      fitness_goal:                 expect.any(String),
      target_weeks:                 expect.any(Number),
      is_circuit:                   expect.any(Boolean),
      environment:                  expect.any(String),
      estimated_duration_minutes:   expect.any(Number),
      fitness_level:                expect.any(String),
      days:                         expect.any(Array),
    });
  });

  it('jede Übung hat die erwarteten Felder', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    for (const ex of allExercises(plan)) {
      expect(typeof ex.exercise_name).toBe('string');
      expect(ex.exercise_name.length).toBeGreaterThan(0);
      expect(typeof ex.sets).toBe('number');
      expect(typeof ex.reps).toBe('number');
    }
  });

  it('jeder Tag hat einen day_index und ein label', async () => {
    const plan = await generateAiPlan(BASE_INPUT);
    plan.days.forEach((day, i) => {
      expect(day.day_index).toBe(i + 1);
      expect(typeof day.label).toBe('string');
      expect(day.label.length).toBeGreaterThan(0);
    });
  });
});
