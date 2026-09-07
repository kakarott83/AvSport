/**
 * services/gemini/exerciseDetailProvider.ts
 *
 * Reichert die von generateWorkoutPlan() erzeugten Übungen mit ausführlichen,
 * deutschen Detailtexten an (Wirkung/Technik, Schritt-für-Schritt-Anleitung,
 * Modifikationen, Sicherheitshinweis, Tipps). Ein einzelner gebündelter
 * Gemini-Call pro Plan — bei jedem Fehler (Netzwerk, ungültiges JSON,
 * Tageslimit, einzelne fehlende Übung) wird lokal auf generische, aber
 * sinnvolle Texte zurückgefallen. Die Planerstellung darf hierdurch nie
 * fehlschlagen.
 */

import { geminiRequest } from './client';
import type { GeneratedDay, GeneratedExercise } from '@/types/workout';

// ─── Öffentliche Typen ──────────────────────────────────────────────────────

export interface ExerciseDetail {
  /** Gängiger englischer Übungsname für die Bildsuche, z. B. "Barbell Squat". */
  name_en:          string;
  short:            string;
  detail_markdown:  string;
  instructions:     string[];
  modifications:    { beginner: string; advanced: string };
  safety:           string;
  tips:             string[];
}

// ─── Interne Hilfstypen ───────────────────────────────────────────────────────

interface FlatExercise {
  id:       string;
  exercise: GeneratedExercise;
}

function flattenDays(days: GeneratedDay[]): FlatExercise[] {
  return days.flatMap((day) =>
    day.exercises.map((exercise, i) => ({ id: `d${day.day_index}-e${i}`, exercise })),
  );
}

// ─── Prompt-Builder ───────────────────────────────────────────────────────────

function buildPrompt(items: FlatExercise[]): string {
  const input = {
    exercises: items.map(({ id, exercise }) => ({
      id,
      name:           exercise.exercise_name,
      sets:           exercise.sets,
      reps:           exercise.target_duration ? undefined : exercise.reps,
      equipment:      exercise.equipment_type || undefined,
      primary_muscle: exercise.muscle_group || undefined,
    })),
  };

  return `Du bist ein präziser Fitness-Textgenerator. Eingabe: JSON { "exercises": [ { "id":string, "name":string, "sets"?:number, "reps"?:number, "equipment"?:string, "primary_muscle"?:string } ] }.

Aufgabe: Für jede Übung liefere nur JSON gemäß diesem Schema (keine erläuternden Texte, keine Kommentare, nur gültiges JSON):

{
  "exercises": [
    {
      "id": string,
      "name_en": string,              // gängiger englischer Übungsname, z. B. "Barbell Squat", "Push-Up", "Romanian Deadlift"
      "short": string,                // Einzeiler, max. 120 Zeichen
      "detail_markdown": string,      // Markdown, genau 1 kurzer Absatz (Wirkung + Technik) + Liste mit genau 2 Stichpunkten: Haltung, Häufiger Fehler
      "instructions": [string],       // 3–4 Schritte, kurze Sätze (6–10 Wörter)
      "modifications": { "beginner": string, "advanced": string },
      "safety": string,               // kurze Warnung (1 Satz)
      "tips": [string]                // genau 2 kurze Tipps
    }
  ]
}

Regeln:
- Alle Textfelder außer "name_en": Deutsch, knapp und ohne Füllwörter.
- "name_en": nur der englische Übungsname, so wie er in einer Übungsdatenbank stünde (kein Satz, keine Erklärung).
- "short" ≤ 120 Zeichen.
- "detail_markdown": 1 Absatz mit 2 Sätzen (Satz 1 = Wirkung, Satz 2 = Technik); danach genau 2 Bullet-Points (Haltung, Häufiger Fehler).
- "instructions": geordnet, 3–4 Items, klar und knapp.
- "tips": genau 2 Items.
- Keine zusätzlichen Felder außerhalb des Schemas.
- Gib nur das JSON-Objekt zurück, strikt gültig, in derselben Reihenfolge und mit denselben "id"-Werten wie die Eingabe.
- Für jede "id" aus der Eingabe muss genau ein Eintrag in der Antwort existieren.

Eingabe:
${JSON.stringify(input)}`;
}

// ─── Response-Validierung ─────────────────────────────────────────────────────

interface RawDetail {
  id?:               unknown;
  name_en?:          unknown;
  short?:             unknown;
  detail_markdown?:   unknown;
  instructions?:      unknown;
  modifications?:     unknown;
  safety?:            unknown;
  tips?:              unknown;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim().length > 0);
}

function validateDetail(raw: RawDetail): ExerciseDetail | null {
  const mods = raw.modifications as { beginner?: unknown; advanced?: unknown } | undefined;

  if (
    !isNonEmptyString(raw.short) ||
    !isNonEmptyString(raw.detail_markdown) ||
    !isStringArray(raw.instructions) ||
    !isStringArray(raw.tips) ||
    !mods ||
    !isNonEmptyString(mods.beginner) ||
    !isNonEmptyString(mods.advanced) ||
    !isNonEmptyString(raw.safety)
  ) {
    return null;
  }

  return {
    // name_en ist optional — fehlt es, greift im UI der deutsche Name für die Bildsuche.
    name_en:         isNonEmptyString(raw.name_en) ? raw.name_en.trim() : '',
    short:           raw.short.trim(),
    detail_markdown: raw.detail_markdown.trim(),
    instructions:    raw.instructions.map((s) => s.trim()),
    modifications:   { beginner: mods.beginner.trim(), advanced: mods.advanced.trim() },
    safety:          raw.safety.trim(),
    tips:            raw.tips.map((s) => s.trim()),
  };
}

function parseResponse(text: string): Map<string, ExerciseDetail> {
  const parsed = JSON.parse(text) as { exercises?: unknown };
  if (!Array.isArray(parsed.exercises)) {
    throw new Error('KI-Antwort: "exercises" fehlt oder ist kein Array');
  }

  const result = new Map<string, ExerciseDetail>();
  for (const raw of parsed.exercises as RawDetail[]) {
    if (!isNonEmptyString(raw.id)) continue;
    const detail = validateDetail(raw);
    if (detail) result.set(raw.id.trim(), detail);
  }
  return result;
}

// ─── Lokaler Fallback ─────────────────────────────────────────────────────────

function buildFallbackDetail(exercise: GeneratedExercise): ExerciseDetail {
  const name   = exercise.exercise_name;
  const muscle = exercise.muscle_group || 'die Zielmuskulatur';
  const equip  = exercise.equipment_type || 'Körpergewicht';
  const dosage = exercise.target_duration
    ? `${exercise.sets} × ${exercise.target_duration} Sekunden`
    : `${exercise.sets} × ${exercise.reps} Wiederholungen`;

  return {
    name_en: '',
    short: `${name} kräftigt ${muscle} — ${dosage}, ${equip}.`.slice(0, 120),
    detail_markdown:
      `${name} trainiert vorrangig ${muscle}. ` +
      `Bewegung kontrolliert und in vollem Bewegungsumfang ausführen, ohne Schwung.\n\n` +
      `- **Haltung**: Rumpf stabil anspannen, Wirbelsäule neutral halten.\n` +
      `- **Häufiger Fehler**: Zu schnelles Tempo oder unvollständiger Bewegungsumfang.`,
    instructions: [
      'Startposition einnehmen und Rumpf stabilisieren.',
      `${dosage} langsam und kontrolliert ausführen.`,
      'Kurz in der Endposition halten, dann zurückführen.',
    ],
    modifications: {
      beginner: 'Weniger Wiederholungen oder ohne Zusatzgewicht ausführen.',
      advanced: 'Tempo verlangsamen oder Zusatzgewicht/Wiederholungen erhöhen.',
    },
    safety: 'Bei Schmerzen oder Unsicherheit die Übung abbrechen und Technik überprüfen.',
    tips: [
      'Auf gleichmäßige, ruhige Atmung achten.',
      'Lieber sauber und langsam als schnell und unsauber ausführen.',
    ],
  };
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

/**
 * Reichert alle Übungen der übergebenen Tage mit KI-Detailtexten an.
 * Schlägt der Gemini-Call fehl oder liefert er unvollständige Daten, wird
 * pro betroffener Übung lokal ein generischer, aber sinnvoller Text erzeugt —
 * die Funktion wirft nie und blockiert die Planerstellung nicht.
 */
export async function enrichDaysWithDetails(days: GeneratedDay[]): Promise<GeneratedDay[]> {
  const flat = flattenDays(days);
  if (flat.length === 0) return days;

  let details = new Map<string, ExerciseDetail>();
  try {
    const text = await geminiRequest([{ text: buildPrompt(flat) }]);
    if (text) details = parseResponse(text);
  } catch (err) {
    console.warn('[ExerciseDetail] Anreicherung fehlgeschlagen, Fallback wird genutzt:', err);
  }

  return days.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise, i) => {
      const id = `d${day.day_index}-e${i}`;
      const detail = details.get(id) ?? buildFallbackDetail(exercise);
      return { ...exercise, ...detail, video_url: null };
    }),
  }));
}
