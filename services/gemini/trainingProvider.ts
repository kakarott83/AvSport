/**
 * services/gemini/trainingProvider.ts
 *
 * Generiert KI-basierte Trainingspläne über den Gemini-Client.
 * Enthält Prompt-Logik, Response-Validierung und Fallback-Pool.
 */

import { geminiRequest } from './client';
import type { AiPlanInput, FocusArea, GeneratedExercise } from '@/types/workout';

// ─── Öffentliche Interfaces (KI-Antwort-Shape) ────────────────────────────────

/** Einzelne Übung, wie sie Gemini zurückgibt und in plan_exercises gespeichert wird. */
export interface WorkoutExercise {
  exercise_name:    string;
  sets:             number;
  reps:             number;
  /** Gewicht in kg (integer oder Dezimalzahl); null bei Körpergewichtsübungen. */
  target_weight_kg: number | null;
  /** Dauer in Sekunden bei Zeitübungen (z. B. Plank); null sonst. */
  target_duration:  number | null;
}

/** Vollständige KI-Antwort für einen Trainingsplan. */
export interface WorkoutPlanAiResponse {
  title:      string;
  is_circuit: boolean;
  exercises:  WorkoutExercise[];
  /**
   * Trainingstage als Supabase-kompatibles int4[].
   * Mapping: 0 = So, 1 = Mo, 2 = Di, 3 = Mi, 4 = Do, 5 = Fr, 6 = Sa
   */
  scheduled_days: number[] | null;
}

// ─── Hilfstabellen ────────────────────────────────────────────────────────────

const DAY_LABEL: Record<number, string> = {
  0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa',
};

const GOAL_LABEL: Record<AiPlanInput['goal'], string> = {
  abnehmen: 'Gewicht verlieren (Fettverbrennung & Ausdauer)',
  muskeln:  'Muskeln aufbauen (Kraft & Hypertrophie)',
};

export const FOCUS_LABEL: Record<FocusArea, string> = {
  bauch:        'Bauch / Core',
  beine:        'Beine',
  oberkoerper:  'Oberkörper',
  'ganzkörper': 'Ganzkörper',
};

// ─── scheduled_days Sanitizer ─────────────────────────────────────────────────

/**
 * Stellt sicher, dass scheduled_days ein Array von validen int4-Werten (0–6) ist.
 * Filtert doppelte, nicht-ganzzahlige oder out-of-range Werte heraus.
 * Gibt null zurück, wenn das Array leer ist (kein Wert für Supabase).
 */
export function sanitizeScheduledDays(days: number[]): number[] | null {
  const valid = Array.from(
    new Set(days.map(Math.trunc).filter((d) => d >= 0 && d <= 6)),
  ).sort((a, b) => a - b);

  return valid.length > 0 ? valid : null;
}

// ─── Prompt-Builder ───────────────────────────────────────────────────────────

function buildPrompt(input: AiPlanInput, sanitizedDays: number[] | null): string {
  const dayNames = sanitizedDays?.length
    ? sanitizedDays.map((d) => DAY_LABEL[d]).join(', ')
    : 'flexibel (keine festen Tage)';

  const daysPerWeek = sanitizedDays?.length ?? 0;

  const splitHint =
    daysPerWeek >= 4
      ? 'Empfehlung: Oberkörper/Unterkörper-Split oder Muskelgruppen-Split.'
      : daysPerWeek === 3
        ? 'Empfehlung: Push/Pull/Beine oder 3× Ganzkörper.'
        : 'Empfehlung: Ganzkörper-Einheiten (Compound-Übungen bevorzugen).';

  const repGuide =
    input.goal === 'abnehmen'
      ? 'Höhere Wiederholungszahlen (12–20), moderate Gewichte. is_circuit: true bei ≥ 3 Tagen.'
      : 'Moderate Wiederholungen (6–12), progressiv schwerere Gewichte. is_circuit: false.';

  return `Du bist ein zertifizierter Personal Trainer. Erstelle einen individualisierten Trainingsplan.

Nutzerprofil:
- Ziel: ${GOAL_LABEL[input.goal]}
- Trainingsfokus: ${FOCUS_LABEL[input.focusArea]}
- Programmdauer: ${input.targetWeeks} Wochen
- Trainingstage: ${dayNames} (${daysPerWeek || 'keine Festlegung'})

${splitHint}
${repGuide}

Liefere NUR ein valides JSON-Objekt (kein Markdown, keine Erklärung, kein Code-Block):
{
  "title": "<motivierender, prägnanter Planname auf Deutsch, max 35 Zeichen>",
  "is_circuit": <true oder false>,
  "exercises": [
    {
      "exercise_name": "<deutsche Übungsbezeichnung>",
      "sets": <Anzahl Sätze, Zahl>,
      "reps": <Wiederholungen pro Satz, Zahl>,
      "target_weight_kg": <Gewicht in kg oder null>,
      "target_duration": <Sekunden bei Zeitübungen wie Plank, sonst null>
    }
  ]
}

Regeln:
- 5–8 Übungen, passend zum Fokusbereich "${FOCUS_LABEL[input.focusArea]}"
- Realistisches Gewicht für Anfänger bis Fortgeschrittene (oder null wenn bodyweight)
- Alle Felder müssen dem Schema entsprechen`;
}

// ─── Response-Validierung ─────────────────────────────────────────────────────

interface RawAiPlan {
  title?:      unknown;
  is_circuit?: unknown;
  exercises?:  unknown;
}

function validateResponse(raw: RawAiPlan): asserts raw is {
  title: string; is_circuit: boolean; exercises: WorkoutExercise[];
} {
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    throw new Error('KI-Antwort: "title" fehlt oder leer');
  }
  if (typeof raw.is_circuit !== 'boolean') {
    throw new Error('KI-Antwort: "is_circuit" muss boolean sein');
  }
  if (!Array.isArray(raw.exercises) || raw.exercises.length === 0) {
    throw new Error('KI-Antwort: "exercises" fehlt oder leer');
  }
}

// ─── Fallback-Pool ────────────────────────────────────────────────────────────

const FALLBACK_POOL: Record<FocusArea, GeneratedExercise[]> = {
  bauch: [
    { exercise_name: 'Crunches',         sets: 3, reps: 20, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Plank',            sets: 3, reps: 1,  target_weight_kg: null, target_duration: 45  },
    { exercise_name: 'Bicycle Crunches', sets: 3, reps: 16, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Leg Raises',       sets: 3, reps: 12, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Russian Twists',   sets: 3, reps: 20, target_weight_kg: null, target_duration: null },
  ],
  beine: [
    { exercise_name: 'Kniebeugen',              sets: 4, reps: 12, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Ausfallschritte',         sets: 3, reps: 10, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Beinpresse',              sets: 3, reps: 12, target_weight_kg: 60,   target_duration: null },
    { exercise_name: 'Rumänisches Kreuzheben',  sets: 3, reps: 10, target_weight_kg: 40,   target_duration: null },
    { exercise_name: 'Wadenheben',              sets: 4, reps: 15, target_weight_kg: null, target_duration: null },
  ],
  oberkoerper: [
    { exercise_name: 'Liegestütze',            sets: 3, reps: 15, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Bankdrücken',            sets: 4, reps: 10, target_weight_kg: 50,   target_duration: null },
    { exercise_name: 'Klimmzüge',              sets: 3, reps: 8,  target_weight_kg: null, target_duration: null },
    { exercise_name: 'Schulterdrücken',        sets: 3, reps: 10, target_weight_kg: 20,   target_duration: null },
    { exercise_name: 'Rudern mit Kurzhantel',  sets: 3, reps: 12, target_weight_kg: 15,   target_duration: null },
  ],
  'ganzkörper': [
    { exercise_name: 'Burpees',         sets: 3, reps: 10, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Kniebeugen',      sets: 3, reps: 12, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Liegestütze',     sets: 3, reps: 15, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Plank',           sets: 3, reps: 1,  target_weight_kg: null, target_duration: 40  },
    { exercise_name: 'Ausfallschritte', sets: 3, reps: 10, target_weight_kg: null, target_duration: null },
    { exercise_name: 'Shoulder Press',  sets: 3, reps: 10, target_weight_kg: 15,   target_duration: null },
  ],
};

function buildFallback(input: AiPlanInput, sanitizedDays: number[] | null): WorkoutPlanAiResponse {
  const exercises = FALLBACK_POOL[input.focusArea].map((ex) =>
    input.goal === 'abnehmen'
      ? {
          ...ex,
          reps: ex.target_duration ? ex.reps : Math.round(ex.reps * 1.25),
          target_weight_kg: ex.target_weight_kg ? Math.round(ex.target_weight_kg * 0.75) : null,
        }
      : {
          ...ex,
          sets: ex.sets + 1,
          target_weight_kg: ex.target_weight_kg ? Math.round(ex.target_weight_kg * 1.2) : null,
        },
  );

  return {
    title:          `${input.targetWeeks}-Wochen ${FOCUS_LABEL[input.focusArea]}-Plan`,
    is_circuit:     input.goal === 'abnehmen',
    exercises,
    scheduled_days: sanitizedDays,
  };
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

/**
 * Generiert einen Trainingsplan via Gemini.
 * Fällt bei API-Fehler oder ungültigem JSON automatisch auf den lokalen Pool zurück.
 *
 * `scheduledDays` wird als valides int4[]-Array für Supabase aufbereitet:
 * nur Ganzzahlen 0–6, keine Duplikate, aufsteigend sortiert.
 */
export async function generateWorkoutPlan(input: AiPlanInput): Promise<WorkoutPlanAiResponse> {
  const sanitizedDays = sanitizeScheduledDays(input.scheduledDays);

  try {
    const text = await geminiRequest([{ text: buildPrompt(input, sanitizedDays) }]);

    if (!text) {
      console.warn('[Training] Gemini leere Antwort — Fallback wird genutzt');
      return buildFallback(input, sanitizedDays);
    }

    console.log('[Training] Gemini-Antwort (Vorschau):', text.slice(0, 120));

    const parsed = JSON.parse(text) as RawAiPlan;
    validateResponse(parsed);

    return {
      title:          parsed.title,
      is_circuit:     parsed.is_circuit,
      exercises:      parsed.exercises,
      scheduled_days: sanitizedDays,
    };
  } catch (err) {
    console.warn('[Training] Fehler beim Plan generieren, Fallback wird genutzt:', err);
    return buildFallback(input, sanitizedDays);
  }
}
