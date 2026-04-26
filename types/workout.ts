// ─────────────────────────────────────────────────────────────────────────────
// Workout types — shared across plan generator, Supabase inserts, and tests
// ─────────────────────────────────────────────────────────────────────────────

export type FitnessGoal = 'abnehmen' | 'muskeln';
export type FocusArea   = 'bauch' | 'beine' | 'oberkoerper' | 'ganzkörper';
export type TargetWeeks = 4 | 8 | 12;

export interface AiPlanInput {
  goal:          FitnessGoal;
  focusArea:     FocusArea;
  targetWeeks:   TargetWeeks;
  /** DB-Integers: 0 = So, 1 = Mo, 2 = Di, 3 = Mi, 4 = Do, 5 = Fr, 6 = Sa */
  scheduledDays: number[];
}

export interface GeneratedExercise {
  exercise_name:   string;
  sets:            number;
  reps:            number;
  target_weight_kg: number | null;
  target_duration:  number | null; // seconds
}

/** Shape that maps directly to a workout_plans row insert */
export interface WorkoutPlanInsert {
  title:            string;
  is_ai_generated:  true;
  focus_area:       FocusArea;
  fitness_goal:     FitnessGoal;
  target_weeks:     TargetWeeks;
  is_circuit:       boolean;
  scheduled_days:   number[] | null;
  /** Exercises are stored as JSON in the plan or inserted into plan_exercises */
  exercises:        GeneratedExercise[];
}
