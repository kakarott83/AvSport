/**
 * services/gemini/trainingProvider.ts
 *
 * Generiert KI-basierte, mehrtägige Trainingspläne (Splits) über den Gemini-Client.
 * Enthält Prompt-Logik, Response-Validierung und Fallback-Pool.
 */

import { geminiRequest, GeminiDailyLimitError } from './client';
import type {
  AiPlanInput, FocusArea, GeneratedDay, GeneratedExercise, FitnessLevel,
} from '@/types/workout';

// ─── Öffentliche Interfaces (KI-Antwort-Shape) ────────────────────────────────

/** Vollständige KI-Antwort für einen mehrtägigen Trainingsplan. */
export interface WorkoutPlanAiResponse {
  title:              string;
  is_circuit:         boolean;
  progression_notes:  string | null;
  days:               GeneratedDay[];
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

export const FITNESS_LEVEL_LABEL: Record<FitnessLevel, string> = {
  anfaenger:       'Anfänger',
  fortgeschritten: 'Fortgeschritten',
  profi:           'Profi',
};

const GYM_EQUIPMENT_TEXT =
  'Vollausstattung Fitnessstudio: Langhantel, Kurzhanteln, Kabelzug, Maschinen, Kettlebell, Freigewichte';

function equipmentText(input: AiPlanInput): string {
  if (input.environment === 'gym') return GYM_EQUIPMENT_TEXT;
  return input.equipment.length > 0
    ? `Zuhause verfügbar: ${input.equipment.join(', ')}`
    : 'Zuhause, keine Geräte — ausschließlich Körpergewichtsübungen';
}

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

/** Anzahl der Split-Tage: Anzahl gewählter Wochentage, sonst 3 als sinnvoller Standard. */
function resolveDaySplitCount(sanitizedDays: number[] | null): number {
  return sanitizedDays?.length || 3;
}

/**
 * Ermittelt den Split-Tag (1-basiert, passend zu plan_days.day_index) für ein Datum.
 * scheduled_days wird aufsteigend sortiert; die Position des Wochentags im sortierten
 * Array entspricht der Tag-Reihenfolge, in der der Plan generiert wurde (siehe buildPrompt).
 * Ohne feste Tage (leer/null) wird immer Tag 1 zurückgegeben.
 */
export function resolveDayIndexForDate(scheduledDays: number[] | null, date: Date): number {
  const sorted = sanitizeScheduledDays(scheduledDays ?? []);
  if (!sorted) return 1;
  const pos = sorted.indexOf(date.getDay());
  return pos >= 0 ? pos + 1 : 1;
}

// ─── Prompt-Builder ───────────────────────────────────────────────────────────

function buildPrompt(input: AiPlanInput, sanitizedDays: number[] | null): string {
  const dayNames = sanitizedDays?.length
    ? sanitizedDays.map((d) => DAY_LABEL[d]).join(', ')
    : 'flexibel (keine festen Tage)';

  const daySplitCount = resolveDaySplitCount(sanitizedDays);

  const splitHint =
    daySplitCount >= 4
      ? 'Empfehlung: Oberkörper/Unterkörper-Split oder Muskelgruppen-Split über die Tage verteilt.'
      : daySplitCount === 3
        ? 'Empfehlung: Push/Pull/Beine oder 3× Ganzkörper mit unterschiedlichem Fokus.'
        : 'Empfehlung: Ganzkörper-Einheiten (Compound-Übungen bevorzugen), pro Tag leicht variiert.';

  const repGuide =
    input.goal === 'abnehmen'
      ? 'Höhere Wiederholungszahlen (12–20), moderate Gewichte, kurze Pausen (30–60s). is_circuit: true bei ≥ 3 Tagen.'
      : 'Moderate Wiederholungen (6–12), progressiv schwerere Gewichte, längere Pausen (60–120s). is_circuit: false.';

  const restrictionsText = input.restrictions?.trim()
    ? `Einschränkungen: ${input.restrictions.trim()} — betroffene Übungen meiden oder durch gelenkschonende Alternativen ersetzen.`
    : 'Keine bekannten Einschränkungen.';

  return `Du bist ein zertifizierter Personal Trainer. Erstelle einen individualisierten, mehrtägigen Trainingsplan (Split).

Nutzerprofil:
- Ziel: ${GOAL_LABEL[input.goal]}
- Trainingsfokus: ${FOCUS_LABEL[input.focusArea]}
- Trainingsniveau: ${FITNESS_LEVEL_LABEL[input.fitnessLevel]}
- Programmdauer: ${input.targetWeeks} Wochen
- Trainingstage/Woche: ${dayNames} (${daySplitCount} Tage im Split)
- Dauer pro Einheit: ca. ${input.sessionMinutes} Minuten (inkl. Warm-up/Cool-down)
- Trainingsort/Equipment: ${equipmentText(input)}
- ${restrictionsText}

${splitHint}
${repGuide}

Erstelle GENAU ${daySplitCount} unterschiedliche Trainingstage (Day 1 bis Day ${daySplitCount}), passend zum Split. Jeder Tag braucht ein kurzes Warm-up (5–10 Min Mobilisation/Aktivierung) und ein Cool-down (Stretching), jeweils passend zu den Übungen des Tages.

Liefere NUR ein valides JSON-Objekt (kein Markdown, keine Erklärung, kein Code-Block):
{
  "title": "<motivierender, prägnanter Planname auf Deutsch, max 35 Zeichen>",
  "is_circuit": <true oder false>,
  "progression_notes": "<1-2 Sätze: wie über die ${input.targetWeeks} Wochen gesteigert werden soll>",
  "days": [
    {
      "day_index": 1,
      "label": "<z. B. 'Push' oder 'Ganzkörper A'>",
      "warmup": "<kurze Warm-up-Anleitung>",
      "cooldown": "<kurze Cool-down-Anleitung>",
      "exercises": [
        {
          "exercise_name": "<kurze deutsche Übungsbezeichnung, max 3 Wörter>",
          "description": "<Bewegung in einem kurzen Satz, max 8 Wörter>",
          "muscle_group": "<Zielmuskelgruppe/Fokus, z. B. 'Brust', 'Beine', 'Core'>",
          "equipment_type": "<Ausrüstung, z. B. 'Langhantel', 'Kurzhantel', 'Maschine', 'Kabelzug', 'Körpergewicht', 'Laufband', 'Band'>",
          "sets": <Zahl>,
          "reps": <Wiederholungen pro Satz, Zahl>,
          "target_weight_kg": <Gewicht in kg oder null>,
          "target_duration": <Sekunden bei Zeitübungen wie Plank, sonst null>,
          "rest_seconds": <Pause zwischen Sätzen in Sekunden, Zahl>
        }
      ]
    }
  ]
}

Regeln:
- Genau ${daySplitCount} Einträge im "days"-Array, day_index von 1 bis ${daySplitCount}
- 4–7 Übungen pro Tag, passend zum Fokusbereich "${FOCUS_LABEL[input.focusArea]}" und zur verfügbaren Zeit
- NUR Übungen mit den verfügbaren Geräten (${equipmentText(input)})
- Nur bekannte, gängige Standardübungen (z. B. Kniebeuge, Bankdrücken, Latziehen, Plank, Glute Bridge, Russian Twist, Romanian Deadlift, Rudern) — keine ungewöhnlichen, überspezialisierten oder unbekannten Namen. Jede Übung muss auch ohne Fachwissen sofort verständlich sein.
- Realistisches Gewicht für ${FITNESS_LEVEL_LABEL[input.fitnessLevel]} (oder null wenn bodyweight)
- "muscle_group" und "equipment_type" sind das Piktogramm der Übung (Anzeige als "[muscle_group / equipment_type]") — keine Emojis oder Symbole, nur diese zwei kurzen, eindeutigen Textwerte. "equipment_type" kann auch ein Bewegungstyp sein, wenn das treffender ist (z. B. "Boden" bei Bodenübungen, "Rotation" bei Drehbewegungen)
- "description": knapp und leicht verständlich, ein Satz, keine Fachbegriffe ohne Erklärung
- Alle Felder müssen dem Schema entsprechen`;
}

// ─── Response-Validierung ─────────────────────────────────────────────────────

interface RawExercise {
  exercise_name?:    unknown;
  description?:       unknown;
  muscle_group?:       unknown;
  equipment_type?:     unknown;
  sets?:              unknown;
  reps?:              unknown;
  target_weight_kg?:  unknown;
  target_duration?:   unknown;
  rest_seconds?:      unknown;
}

interface RawDay {
  day_index?: unknown;
  label?:     unknown;
  warmup?:    unknown;
  cooldown?:  unknown;
  exercises?: unknown;
}

interface RawAiPlan {
  title?:              unknown;
  is_circuit?:         unknown;
  progression_notes?:  unknown;
  days?:               unknown;
}

function validateExercise(raw: RawExercise, ctx: string): GeneratedExercise {
  if (typeof raw.exercise_name !== 'string' || !raw.exercise_name.trim()) {
    throw new Error(`KI-Antwort (${ctx}): "exercise_name" fehlt`);
  }
  if (typeof raw.sets !== 'number' || typeof raw.reps !== 'number') {
    throw new Error(`KI-Antwort (${ctx}): "sets"/"reps" müssen Zahlen sein`);
  }
  return {
    exercise_name:    raw.exercise_name.trim(),
    description:      typeof raw.description  === 'string' ? raw.description.trim()  : '',
    muscle_group:     typeof raw.muscle_group === 'string' ? raw.muscle_group.trim() : '',
    equipment_type:   typeof raw.equipment_type === 'string' ? raw.equipment_type.trim() : '',
    sets:             raw.sets,
    reps:             raw.reps,
    target_weight_kg: typeof raw.target_weight_kg === 'number' ? raw.target_weight_kg : null,
    target_duration:  typeof raw.target_duration  === 'number' ? raw.target_duration  : null,
    rest_seconds:     typeof raw.rest_seconds     === 'number' ? raw.rest_seconds     : null,
  };
}

function validateResponse(raw: RawAiPlan): {
  title: string; is_circuit: boolean; progression_notes: string | null; days: GeneratedDay[];
} {
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    throw new Error('KI-Antwort: "title" fehlt oder leer');
  }
  if (typeof raw.is_circuit !== 'boolean') {
    throw new Error('KI-Antwort: "is_circuit" muss boolean sein');
  }
  if (!Array.isArray(raw.days) || raw.days.length === 0) {
    throw new Error('KI-Antwort: "days" fehlt oder leer');
  }

  const days: GeneratedDay[] = raw.days.map((rawDay, i) => {
    const d = rawDay as RawDay;
    if (typeof d.label !== 'string' || !d.label.trim()) {
      throw new Error(`KI-Antwort: Tag ${i + 1} "label" fehlt`);
    }
    if (!Array.isArray(d.exercises) || d.exercises.length === 0) {
      throw new Error(`KI-Antwort: Tag ${i + 1} "exercises" fehlt oder leer`);
    }
    return {
      day_index: typeof d.day_index === 'number' ? d.day_index : i + 1,
      label:     d.label.trim(),
      warmup:    typeof d.warmup   === 'string' ? d.warmup.trim()   : null,
      cooldown:  typeof d.cooldown === 'string' ? d.cooldown.trim() : null,
      exercises: (d.exercises as RawExercise[]).map(
        (ex, j) => validateExercise(ex, `Tag ${i + 1}, Übung ${j + 1}`),
      ),
    };
  });

  return {
    title:              raw.title.trim(),
    is_circuit:         raw.is_circuit,
    progression_notes:  typeof raw.progression_notes === 'string' ? raw.progression_notes.trim() : null,
    days,
  };
}

// ─── Fallback-Pool ────────────────────────────────────────────────────────────

const FALLBACK_POOL: Record<FocusArea, GeneratedExercise[]> = {
  bauch: [
    { exercise_name: 'Crunches',         description: 'Oberkörper vom Boden einrollen, Bauch anspannen.',      muscle_group: 'Bauch', equipment_type: 'Körpergewicht', sets: 3, reps: 20, target_weight_kg: null, target_duration: null, rest_seconds: 30 },
    { exercise_name: 'Plank',            description: 'Unterarmstütz halten, Körper gerade.',                  muscle_group: 'Bauch', equipment_type: 'Körpergewicht', sets: 3, reps: 1,  target_weight_kg: null, target_duration: 45,   rest_seconds: 30 },
    { exercise_name: 'Bicycle Crunches', description: 'Ellbogen zum gegenüberliegenden Knie führen.',          muscle_group: 'Bauch', equipment_type: 'Körpergewicht', sets: 3, reps: 16, target_weight_kg: null, target_duration: null, rest_seconds: 30 },
    { exercise_name: 'Leg Raises',       description: 'Gestreckte Beine im Liegen heben und senken.',          muscle_group: 'Bauch', equipment_type: 'Körpergewicht', sets: 3, reps: 12, target_weight_kg: null, target_duration: null, rest_seconds: 30 },
    { exercise_name: 'Russian Twists',   description: 'Im Sitzen Oberkörper rotieren, Boden berühren.',        muscle_group: 'Bauch', equipment_type: 'Körpergewicht', sets: 3, reps: 20, target_weight_kg: null, target_duration: null, rest_seconds: 30 },
  ],
  beine: [
    { exercise_name: 'Kniebeugen',              description: 'Hüfte tief absenken, Knie in Zehenrichtung.',        muscle_group: 'Beine',        equipment_type: 'Körpergewicht', sets: 4, reps: 12, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Ausfallschritte',         description: 'Großer Schritt nach vorn, Knie fast zum Boden.',     muscle_group: 'Beine',        equipment_type: 'Körpergewicht', sets: 3, reps: 10, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Beinpresse',              description: 'Platte mit den Beinen kontrolliert wegdrücken.',    muscle_group: 'Beine',        equipment_type: 'Maschine',      sets: 3, reps: 12, target_weight_kg: 60,   target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Rumän. Kreuzheben',       description: 'Hüfte nach hinten schieben, Rücken gerade.',        muscle_group: 'Beine/Rücken', equipment_type: 'Langhantel',    sets: 3, reps: 10, target_weight_kg: 40,   target_duration: null, rest_seconds: 90 },
    { exercise_name: 'Wadenheben',              description: 'Auf die Zehenspitzen heben und langsam senken.',    muscle_group: 'Beine',        equipment_type: 'Körpergewicht', sets: 4, reps: 15, target_weight_kg: null, target_duration: null, rest_seconds: 30 },
  ],
  oberkoerper: [
    { exercise_name: 'Liegestütze',            description: 'Körper gerade, Brust Richtung Boden senken.',       muscle_group: 'Brust',           equipment_type: 'Körpergewicht', sets: 3, reps: 15, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Bankdrücken',            description: 'Langhantel kontrolliert zur Brust senken, drücken.', muscle_group: 'Brust',           equipment_type: 'Langhantel',    sets: 4, reps: 10, target_weight_kg: 50,   target_duration: null, rest_seconds: 90 },
    { exercise_name: 'Klimmzüge',              description: 'Körper hochziehen, Kinn über die Stange.',          muscle_group: 'Rücken',          equipment_type: 'Körpergewicht', sets: 3, reps: 8,  target_weight_kg: null, target_duration: null, rest_seconds: 90 },
    { exercise_name: 'Schulterdrücken',        description: 'Hantel über Kopf drücken, Rumpf stabil halten.',    muscle_group: 'Schultern',       equipment_type: 'Kurzhantel',    sets: 3, reps: 10, target_weight_kg: 20,   target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Kurzhantel-Rudern',      description: 'Hantel zur Hüfte ziehen, Rücken gerade halten.',    muscle_group: 'Rücken',          equipment_type: 'Kurzhantel',    sets: 3, reps: 12, target_weight_kg: 15,   target_duration: null, rest_seconds: 60 },
  ],
  'ganzkörper': [
    { exercise_name: 'Burpees',         description: 'Squat, Liegestütz, Strecksprung fließend kombiniert.',  muscle_group: 'Ganzkörper', equipment_type: 'Körpergewicht', sets: 3, reps: 10, target_weight_kg: null, target_duration: null, rest_seconds: 45 },
    { exercise_name: 'Kniebeugen',      description: 'Hüfte tief absenken, Knie in Zehenrichtung.',           muscle_group: 'Beine',      equipment_type: 'Körpergewicht', sets: 3, reps: 12, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Liegestütze',     description: 'Körper gerade, Brust Richtung Boden senken.',          muscle_group: 'Brust',      equipment_type: 'Körpergewicht', sets: 3, reps: 15, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Plank',           description: 'Unterarmstütz halten, Körper gerade.',                 muscle_group: 'Core',       equipment_type: 'Körpergewicht', sets: 3, reps: 1,  target_weight_kg: null, target_duration: 40,   rest_seconds: 30 },
    { exercise_name: 'Ausfallschritte', description: 'Großer Schritt nach vorn, Knie fast zum Boden.',        muscle_group: 'Beine',      equipment_type: 'Körpergewicht', sets: 3, reps: 10, target_weight_kg: null, target_duration: null, rest_seconds: 60 },
    { exercise_name: 'Shoulder Press',  description: 'Hanteln über Kopf drücken, Core anspannen.',           muscle_group: 'Schultern',  equipment_type: 'Kurzhantel',    sets: 3, reps: 10, target_weight_kg: 15,   target_duration: null, rest_seconds: 60 },
  ],
};

function buildFallback(input: AiPlanInput, sanitizedDays: number[] | null): WorkoutPlanAiResponse {
  const daySplitCount = resolveDaySplitCount(sanitizedDays);

  // Bei Zuhause ohne Geräte: nur Körpergewichtsübungen aus dem Pool übernehmen.
  const bodyweightOnly = input.environment === 'home' && input.equipment.length === 0;
  const basePool = FALLBACK_POOL[input.focusArea];
  const filtered = bodyweightOnly ? basePool.filter((ex) => ex.target_weight_kg === null) : basePool;
  const pool = filtered.length > 0 ? filtered : basePool;

  const exercises = pool.map((ex) =>
    input.goal === 'abnehmen'
      ? {
          ...ex,
          reps: ex.target_duration ? ex.reps : Math.round(ex.reps * 1.25),
          target_weight_kg: ex.target_weight_kg ? Math.round(ex.target_weight_kg * 0.75) : null,
          rest_seconds: 30,
        }
      : {
          ...ex,
          sets: ex.sets + 1,
          target_weight_kg: ex.target_weight_kg ? Math.round(ex.target_weight_kg * 1.2) : null,
        },
  );

  const days: GeneratedDay[] = Array.from({ length: daySplitCount }, (_, i) => ({
    day_index: i + 1,
    label:     daySplitCount > 1 ? `${FOCUS_LABEL[input.focusArea]} · Tag ${i + 1}` : FOCUS_LABEL[input.focusArea],
    warmup:    '5–10 Min. lockeres Cardio + dynamisches Dehnen der beanspruchten Muskeln.',
    cooldown:  '5 Min. statisches Dehnen der trainierten Muskelgruppen, ruhige Atmung.',
    exercises,
  }));

  return {
    title:              `${input.targetWeeks}-Wochen ${FOCUS_LABEL[input.focusArea]}-Plan`,
    is_circuit:         input.goal === 'abnehmen',
    progression_notes:  'Steigere alle 2 Wochen entweder das Gewicht (+2,5–5 kg) oder die Wiederholungen (+1–2 pro Satz).',
    days,
    scheduled_days:     sanitizedDays,
  };
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

/**
 * Generiert einen mehrtägigen Trainingsplan via Gemini.
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
    const validated = validateResponse(parsed);

    return {
      ...validated,
      scheduled_days: sanitizedDays,
    };
  } catch (err) {
    if (err instanceof GeminiDailyLimitError) throw err;
    console.warn('[Training] Fehler beim Plan generieren, Fallback wird genutzt:', err);
    return buildFallback(input, sanitizedDays);
  }
}
