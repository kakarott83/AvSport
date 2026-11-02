/**
 * services/gemini/mealPlanProvider.ts
 *
 * KI-Mahlzeitenplan: ein Gemini-Aufruf pro Plan, ein weiterer pro „Neu
 * generieren“. Prompts und Prüfung der Antwort: lib/mealPlan.ts. Limit-Fehler
 * (GeminiDailyLimitError …) werden unverändert weitergereicht, damit der
 * Screen die Paywall zeigen kann.
 */

import { getLanguage } from '@/lib/i18n';
import {
  allMealNames,
  buildMealPlanPrompt,
  buildRegenerateMealPrompt,
  mealSlotsFor,
  parseMealPlanResponse,
  parseSingleMealResponse,
  slotKcalTargets,
  type MealPlanData,
  type MealPlanPreferences,
  type MealPlanTargets,
  type PlannedMeal,
} from '@/lib/mealPlan';
import { geminiRequest } from './client';

export async function generateMealPlan(
  prefs: MealPlanPreferences,
  targets: MealPlanTargets,
  startDate: string,
): Promise<MealPlanData> {
  const prompt = buildMealPlanPrompt(prefs, targets, getLanguage());
  const text = await geminiRequest([{ text: prompt }], 'meal_plan');
  return parseMealPlanResponse(text, prefs, startDate);
}

/** Neue Mahlzeit für denselben Platz im Plan (gleiche ID, gleicher Typ). */
export async function regenerateMeal(
  plan: MealPlanData,
  meal: PlannedMeal,
  prefs: MealPlanPreferences,
  targets: MealPlanTargets,
): Promise<PlannedMeal> {
  const slots = mealSlotsFor(prefs.mealsPerDay);
  const index = Math.max(0, slots.indexOf(meal.slot));
  const kcal = slotKcalTargets(slots, targets.kcal)[index] ?? meal.calories;
  const proteinMin = Math.round((targets.protein * kcal) / Math.max(targets.kcal, 1));

  const prompt = buildRegenerateMealPrompt(prefs, meal.slot, kcal, proteinMin, allMealNames(plan), getLanguage());
  const text = await geminiRequest([{ text: prompt }], 'meal_plan');
  return parseSingleMealResponse(text, meal.id, meal.slot);
}
