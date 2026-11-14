/**
 * Unit-Tests: Hilfsfunktionen und Methoden-Logik aus trainingProvider.ts
 * (sanitizeScheduledDays, resolveDayIndexForDate, generateWorkoutPlan)
 */

jest.mock('@/services/supabaseClient');

jest.mock('./client', () => ({
  geminiRequest: jest.fn(),
  GeminiDailyLimitError: class GeminiDailyLimitError extends Error {},
}));

import { geminiRequest } from './client';
import { generateWorkoutPlan, resolveDayIndexForDate, sanitizeScheduledDays } from './trainingProvider';
import type { AiPlanInput, TrainingMethod } from '@/types/workout';

describe('sanitizeScheduledDays', () => {
  it('sortiert aufsteigend und entfernt Duplikate', () => {
    expect(sanitizeScheduledDays([5, 1, 1, 3])).toEqual([1, 3, 5]);
  });

  it('filtert Werte außerhalb 0–6 heraus', () => {
    expect(sanitizeScheduledDays([-1, 2, 7, 9])).toEqual([2]);
  });

  it('gibt null zurück bei leerem Ergebnis', () => {
    expect(sanitizeScheduledDays([])).toBeNull();
    expect(sanitizeScheduledDays([-1, 8])).toBeNull();
  });
});

describe('resolveDayIndexForDate', () => {
  // Mo=1, Mi=3, Fr=5 → sortiert [1,3,5] → Position 0,1,2 → day_index 1,2,3
  const scheduled = [5, 1, 3];

  // Lokale Konstruktoren (statt ISO-Strings) — vermeidet UTC/Timezone-Verschiebung des Wochentags.
  it('ordnet den Wochentag der richtigen Position im sortierten Split zu', () => {
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 24))).toBe(1); // Mo
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 26))).toBe(2); // Mi
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 28))).toBe(3); // Fr
  });

  it('gibt Tag 1 zurück wenn der Wochentag nicht im Split enthalten ist', () => {
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 25))).toBe(1); // Di — nicht geplant
  });

  it('gibt Tag 1 zurück ohne feste Tage (leer/null)', () => {
    expect(resolveDayIndexForDate([], new Date(2026, 7, 24))).toBe(1);
    expect(resolveDayIndexForDate(null, new Date(2026, 7, 24))).toBe(1);
  });
});

describe('generateWorkoutPlan — Trainingsmethode', () => {
  const geminiRequestMock = geminiRequest as jest.MockedFunction<typeof geminiRequest>;

  function makeInput(trainingMethod: TrainingMethod): AiPlanInput {
    return {
      goal:           'muskeln',
      trainingMethod,
      focusArea:      'ganzkörper',
      targetWeeks:    8,
      scheduledDays:  [1, 3, 5],
      environment:    'gym',
      equipment:      [],
      sessionMinutes: 60,
      fitnessLevel:   'fortgeschritten',
      restrictions:   null,
    };
  }

  /** Minimal gültige KI-Antwort mit frei wählbarem is_circuit. */
  function aiResponse(isCircuit: boolean): string {
    return JSON.stringify({
      title: 'Testplan',
      is_circuit: isCircuit,
      progression_notes: null,
      days: [1, 2, 3].map((n) => ({
        day_index: n,
        label: `Tag ${n}`,
        warmup: 'Warm-up',
        cooldown: 'Cool-down',
        exercises: [
          { exercise_name: 'Kniebeuge', description: 'Tief absenken.', muscle_group: 'Beine', equipment_type: 'Langhantel', sets: 4, reps: 10, target_weight_kg: 60, target_duration: null, rest_seconds: 90 },
        ],
      })),
    });
  }

  beforeEach(() => geminiRequestMock.mockReset());

  it('erzwingt is_circuit aus der Methode, auch gegen die KI-Antwort', async () => {
    geminiRequestMock.mockResolvedValue(aiResponse(false));
    await expect(generateWorkoutPlan(makeInput('hiit'))).resolves.toMatchObject({ is_circuit: true });

    geminiRequestMock.mockResolvedValue(aiResponse(true));
    await expect(generateWorkoutPlan(makeInput('klassisch'))).resolves.toMatchObject({ is_circuit: false });
  });

  it('formt den Fallback bei HIIT auf Zeitintervalle um', async () => {
    geminiRequestMock.mockRejectedValue(new Error('Gemini nicht erreichbar'));

    const plan = await generateWorkoutPlan(makeInput('hiit'));
    const exercises = plan.days.flatMap((d) => d.exercises);

    expect(plan.is_circuit).toBe(true);
    expect(exercises.length).toBeGreaterThan(0);
    for (const ex of exercises) {
      expect(ex.target_duration).not.toBeNull();
      expect(ex.reps).toBe(1);
      expect(ex.target_weight_kg).toBeNull();
      expect(ex.rest_seconds).toBe(20);
    }
  });

  it('lässt den Fallback bei klassischem Krafttraining wiederholungsbasiert', async () => {
    geminiRequestMock.mockRejectedValue(new Error('Gemini nicht erreichbar'));

    const plan = await generateWorkoutPlan(makeInput('klassisch'));
    const exercises = plan.days.flatMap((d) => d.exercises);

    expect(plan.is_circuit).toBe(false);
    expect(exercises.some((ex) => ex.reps > 1)).toBe(true);
  });

  it('plant bei Calisthenics ausschließlich ohne Zusatzgewicht', async () => {
    geminiRequestMock.mockRejectedValue(new Error('Gemini nicht erreichbar'));

    const plan = await generateWorkoutPlan(makeInput('calisthenics'));

    for (const ex of plan.days.flatMap((d) => d.exercises)) {
      expect(ex.target_weight_kg).toBeNull();
    }
  });
});
