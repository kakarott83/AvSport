// ─────────────────────────────────────────────────────────────────────────────
// Workout types — shared across plan generator, Supabase inserts, and tests
// ─────────────────────────────────────────────────────────────────────────────

export type FitnessGoal    = 'abnehmen' | 'muskeln';
export type FocusArea      = 'bauch' | 'beine' | 'oberkoerper' | 'ganzkörper';
export type TargetWeeks    = 4 | 8 | 12;
export type Environment    = 'gym' | 'home';
export type FitnessLevel   = 'anfaenger' | 'fortgeschritten' | 'profi';
export type SessionMinutes = 30 | 45 | 60 | 90;

export interface AiPlanInput {
  goal:            FitnessGoal;
  focusArea:       FocusArea;
  targetWeeks:     TargetWeeks;
  /** DB-Integers: 0 = So, 1 = Mo, 2 = Di, 3 = Mi, 4 = Do, 5 = Fr, 6 = Sa */
  scheduledDays:   number[];
  environment:     Environment;
  /** Bei environment 'home': leeres Array = nur Körpergewicht. Bei 'gym' ungenutzt (volle Ausstattung angenommen). */
  equipment:       string[];
  sessionMinutes:  SessionMinutes;
  fitnessLevel:    FitnessLevel;
  /** Verletzungen/Einschränkungen als Freitext, z. B. "Knieprobleme". */
  restrictions:    string | null;
}

export interface GeneratedExercise {
  exercise_name:    string;
  /** Kurze, leicht verständliche Bewegungserklärung (max. 1 Satz). */
  description:       string;
  /**
   * Zielmuskelgruppe/Fokus, z. B. "Brust", "Beine", "Core".
   * Bildet zusammen mit equipment_type das Piktogramm "[muscle_group / equipment_type]" — keine Emojis.
   */
  muscle_group:       string;
  /** Ausrüstungstyp, z. B. "Langhantel", "Maschine", "Körpergewicht". */
  equipment_type:     string;
  sets:              number;
  reps:              number;
  target_weight_kg:  number | null;
  target_duration:   number | null; // seconds
  rest_seconds:      number | null;

  // ─── KI-Detailtexte (siehe exerciseDetailProvider.ts) ───────────────────────
  // Optional, weil roh generierte/manuelle Übungen sie noch nicht haben —
  // enrichDaysWithDetails() füllt sie für jede KI-Übung immer (KI oder Fallback).
  /** Einzeiler, max. 120 Zeichen. */
  short?:            string;
  /** Markdown: 1 kurzer Absatz (Wirkung + Technik) + 2 Bullets (Haltung, Häufiger Fehler). */
  detail_markdown?:  string;
  /** 3–4 kurze, geordnete Ausführungsschritte. */
  instructions?:     string[];
  modifications?:    { beginner: string; advanced: string };
  /** Kurze Sicherheitswarnung (1 Satz). */
  safety?:           string;
  /** Genau 2 kurze Tipps. */
  tips?:             string[];
  /** Immer null — Video-Links werden nicht von der KI generiert (Halluzinationsrisiko). */
  video_url?:        string | null;
}

/** Ein Trainingstag im Split (z. B. "Push", "Beine", "Ganzkörper A"). */
export interface GeneratedDay {
  day_index: number; // 1-basiert
  label:     string;
  warmup:    string | null;
  cooldown:  string | null;
  exercises: GeneratedExercise[];
}

/** Shape that maps directly to a workout_plans row insert (+ plan_days/plan_exercises). */
export interface WorkoutPlanInsert {
  title:                       string;
  is_ai_generated:             true;
  focus_area:                  FocusArea;
  fitness_goal:                FitnessGoal;
  target_weeks:                TargetWeeks;
  is_circuit:                  boolean;
  scheduled_days:              number[] | null;
  environment:                 Environment;
  equipment:                   string[];
  estimated_duration_minutes:  SessionMinutes;
  restrictions:                string | null;
  progression_notes:           string | null;
  fitness_level:               FitnessLevel;
  days:                        GeneratedDay[];
}
