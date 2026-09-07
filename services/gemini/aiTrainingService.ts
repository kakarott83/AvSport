/**
 * aiTrainingService.ts
 * Orchestriert KI-Plangenerierung (via trainingProvider) und Supabase-Persistenz.
 */

import { generateWorkoutPlan } from './trainingProvider';
import { enrichDaysWithDetails } from './exerciseDetailProvider';
import type { AiPlanInput, WorkoutPlanInsert } from '@/types/workout';

// ─── Plan generieren ──────────────────────────────────────────────────────────

/**
 * Generiert einen mehrtägigen Trainingsplan und mappt ihn auf WorkoutPlanInsert.
 * Fallback-Logik liegt vollständig im trainingProvider.
 */
export async function generateAiPlan(input: AiPlanInput): Promise<WorkoutPlanInsert> {
  const ai = await generateWorkoutPlan(input);
  const days = await enrichDaysWithDetails(ai.days);

  return {
    title:                       ai.title,
    is_ai_generated:             true,
    focus_area:                  input.focusArea,
    fitness_goal:                input.goal,
    target_weeks:                input.targetWeeks,
    is_circuit:                  ai.is_circuit,
    scheduled_days:              ai.scheduled_days,
    environment:                 input.environment,
    equipment:                   input.environment === 'home' ? input.equipment : [],
    estimated_duration_minutes:  input.sessionMinutes,
    restrictions:                input.restrictions,
    progression_notes:           ai.progression_notes,
    fitness_level:               input.fitnessLevel,
    days,
  };
}

// ─── Plan speichern ───────────────────────────────────────────────────────────

/**
 * Persistiert den Plan in Supabase (workout_plans → plan_days → plan_exercises).
 * Gibt die neue Plan-ID zurück.
 */
export async function saveAiPlan(
  plan: WorkoutPlanInsert,
  userId: string,
  supabase: import('@supabase/supabase-js').SupabaseClient,
): Promise<string> {
  const { days, ...planRow } = plan;

  const { data: inserted, error: planError } = await supabase
    .from('workout_plans')
    .insert({ ...planRow, user_id: userId })
    .select('id')
    .single();

  if (planError || !inserted) {
    throw new Error(planError?.message ?? 'Plan konnte nicht gespeichert werden.');
  }

  const planId: string = inserted.id;

  for (const day of days) {
    const { data: insertedDay, error: dayError } = await supabase
      .from('plan_days')
      .insert({
        plan_id:   planId,
        day_index: day.day_index,
        label:     day.label,
        warmup:    day.warmup,
        cooldown:  day.cooldown,
      })
      .select('id')
      .single();

    if (dayError || !insertedDay) {
      throw new Error(dayError?.message ?? `Tag ${day.day_index} konnte nicht gespeichert werden.`);
    }

    const { error: exError } = await supabase
      .from('plan_exercises')
      .insert(
        day.exercises.map((ex, i) => ({
          plan_id:          planId,
          day_id:            insertedDay.id,
          order_index:       i,
          exercise_name:     ex.exercise_name,
          description:       ex.description,
          muscle_group:      ex.muscle_group,
          equipment_type:    ex.equipment_type,
          sets:              ex.sets,
          reps:              ex.reps,
          target_duration:   ex.target_duration,
          target_weight_kg:  ex.target_weight_kg,
          rest_seconds:      ex.rest_seconds,
          name_en:           ex.name_en ?? null,
          short:             ex.short ?? null,
          detail_markdown:   ex.detail_markdown ?? null,
          instructions:      ex.instructions ?? null,
          modifications:     ex.modifications ?? null,
          safety:            ex.safety ?? null,
          tips:              ex.tips ?? null,
          video_url:         ex.video_url ?? null,
        })),
      );

    if (exError) throw new Error(exError.message);
  }

  return planId;
}
