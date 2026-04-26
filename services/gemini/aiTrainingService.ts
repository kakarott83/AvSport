/**
 * aiTrainingService.ts
 * Orchestriert KI-Plangenerierung (via trainingProvider) und Supabase-Persistenz.
 */

import { generateWorkoutPlan } from './trainingProvider';
import type { AiPlanInput, WorkoutPlanInsert } from '@/types/workout';

// ─── Plan generieren ──────────────────────────────────────────────────────────

/**
 * Generiert einen Trainingsplan und mappt ihn auf WorkoutPlanInsert.
 * Fallback-Logik liegt vollständig im trainingProvider.
 */
export async function generateAiPlan(input: AiPlanInput): Promise<WorkoutPlanInsert> {
  const ai = await generateWorkoutPlan(input);

  return {
    title:           ai.title,
    is_ai_generated: true,
    focus_area:      input.focusArea,
    fitness_goal:    input.goal,
    target_weeks:    input.targetWeeks,
    is_circuit:      ai.is_circuit,
    scheduled_days:  ai.scheduled_days,
    exercises:       ai.exercises,
  };
}

// ─── Plan speichern ───────────────────────────────────────────────────────────

/**
 * Persistiert den Plan in Supabase (workout_plans + plan_exercises).
 * Gibt die neue Plan-ID zurück.
 */
export async function saveAiPlan(
  plan: WorkoutPlanInsert,
  userId: string,
  supabase: import('@supabase/supabase-js').SupabaseClient,
): Promise<string> {
  const { exercises, ...planRow } = plan;

  const { data: inserted, error: planError } = await supabase
    .from('workout_plans')
    .insert({ ...planRow, user_id: userId })
    .select('id')
    .single();

  if (planError || !inserted) {
    throw new Error(planError?.message ?? 'Plan konnte nicht gespeichert werden.');
  }

  const planId: string = inserted.id;

  const { error: exError } = await supabase
    .from('plan_exercises')
    .insert(
      exercises.map((ex) => ({
        plan_id:          planId,
        exercise_name:    ex.exercise_name,
        sets:             ex.sets,
        reps:             ex.reps,
        target_duration:  ex.target_duration,
        target_weight_kg: ex.target_weight_kg,
      })),
    );

  if (exError) throw new Error(exError.message);

  return planId;
}
