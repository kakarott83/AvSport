/**
 * services/mealPlans/mealPlanService.ts — gespeicherte Mahlzeitenpläne
 * (public.meal_plans, RLS: nur eigene Zeilen) und „Als gegessen eintragen“.
 */

import type { MealPlanData, MealPlanPreferences, MealPlanTargets, PlannedMeal } from '@/lib/mealPlan';
import { supabase } from '@/services/supabaseClient';

export interface SavedMealPlan {
  id: string;
  startDate: string;
  days: number;
  preferences: MealPlanPreferences;
  targets: MealPlanTargets;
  plan: MealPlanData;
  createdAt: string;
}

/** Wie viele Pläne in „Gespeicherte Pläne“ angezeigt werden. */
const HISTORY_LIMIT = 20;

interface Row {
  id: string;
  start_date: string;
  days: number;
  preferences: MealPlanPreferences;
  targets: MealPlanTargets;
  plan: MealPlanData;
  created_at: string;
}

function fromRow(r: Row): SavedMealPlan {
  return {
    id: r.id,
    startDate: r.start_date,
    days: r.days,
    preferences: r.preferences,
    targets: r.targets,
    plan: { days: r.plan?.days ?? [], shoppingChecked: r.plan?.shoppingChecked ?? [] },
    createdAt: r.created_at,
  };
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  return user.id;
}

export async function listMealPlans(): Promise<SavedMealPlan[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('meal_plans')
    .select('id, start_date, days, preferences, targets, plan, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function createMealPlan(
  startDate: string,
  preferences: MealPlanPreferences,
  targets: MealPlanTargets,
  plan: MealPlanData,
): Promise<SavedMealPlan> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('meal_plans')
    .insert({ user_id: userId, start_date: startDate, days: plan.days.length, preferences, targets, plan })
    .select('id, start_date, days, preferences, targets, plan, created_at')
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

export async function updateMealPlan(id: string, plan: MealPlanData): Promise<void> {
  const { error } = await supabase
    .from('meal_plans')
    .update({ plan, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMealPlan(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Übernimmt eine geplante Mahlzeit als normalen Eintrag ins Ernährungstagebuch (heute). */
export async function logMealToJournal(meal: PlannedMeal): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('food_logs').insert({
    user_id: userId,
    meal_name: meal.name,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
  });
  if (error) throw new Error(error.message);
}
