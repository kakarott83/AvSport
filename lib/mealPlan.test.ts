import {
  buildMealPlanPrompt,
  buildRegenerateMealPrompt,
  buildShoppingList,
  clampDays,
  dayTotals,
  DEFAULT_PREFERENCES,
  mealSlotsFor,
  normalizeIntolerances,
  parseMealPlanResponse,
  parseSingleMealResponse,
  planningKcal,
  proteinGoal,
  replaceMeal,
  slotKcalTargets,
  type MealPlanData,
  type MealPlanPreferences,
} from './mealPlan';

const prefs: MealPlanPreferences = { ...DEFAULT_PREFERENCES, days: 2, mealsPerDay: 3 };

const meal = (name: string, slot = 'lunch', extra: Record<string, unknown> = {}) => ({
  slot,
  name,
  description: 'Alles mischen.',
  prep_minutes: 15,
  ingredients: [{ name: 'Haferflocken', amount: 60, unit: 'g' }, { name: 'Salz', amount: null, unit: '' }],
  calories: 500,
  protein: 30,
  carbs: 50,
  fat: 15,
  ...extra,
});

describe('Zielwerte', () => {
  it('planningKcal zieht heutiges Training und Extra-Schritte ab', () => {
    expect(planningKcal(2600, { workoutCounted: true, workoutKcal: 300, stepKcal: 100 })).toBe(2200);
    expect(planningKcal(2600, { workoutCounted: false, workoutKcal: 300, stepKcal: 0 })).toBe(2600);
    expect(planningKcal(2100, null)).toBe(2100);
  });

  it('planningKcal geht nie unter 1200 kcal', () => {
    expect(planningKcal(1300, { workoutCounted: true, workoutKcal: 500, stepKcal: 0 })).toBe(1200);
  });

  it('proteinGoal wie auf dem Home-Screen', () => {
    expect(proteinGoal(80, null)).toBe(160);
    expect(proteinGoal(80, 1.6)).toBe(128);
    expect(proteinGoal(null, 2)).toBe(0);
  });
});

describe('Mahlzeiten pro Tag', () => {
  it('liefert die Reihenfolge der Mahlzeiten', () => {
    expect(mealSlotsFor(3)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(mealSlotsFor(4)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(mealSlotsFor(5)).toHaveLength(5);
  });

  it('verteilt das Tagesziel exakt auf die Mahlzeiten', () => {
    for (const n of [3, 4, 5] as const) {
      const parts = slotKcalTargets(mealSlotsFor(n), 2137);
      expect(parts.reduce((s, x) => s + x, 0)).toBe(2137);
    }
    expect(slotKcalTargets(['breakfast', 'lunch', 'dinner'], 1800)).toEqual([500, 700, 600]);
  });
});

describe('Eingaben', () => {
  it('normalizeIntolerances entfernt Leeres und Duplikate und kürzt', () => {
    expect(normalizeIntolerances(['lactose', ' Lactose ', '', '  Sellerie  ', 'x'.repeat(80)])).toEqual([
      'lactose',
      'Sellerie',
      'x'.repeat(40),
    ]);
  });

  it('clampDays bleibt zwischen 1 und 7', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(9)).toBe(7);
    expect(clampDays(3.4)).toBe(3);
  });
});

describe('Prompts', () => {
  const targets = { kcal: 2000, protein: 140, goal: 'lose' as const };

  it('enthält Ziele, Mahlzeiten und Vorgaben', () => {
    const p = buildMealPlanPrompt(
      { ...prefs, diet: 'vegan', intolerances: ['gluten', 'Sellerie'], effort: 'quick' },
      targets,
      'de',
    );
    expect(p).toContain('2 Tag(e)');
    expect(p).toContain('2000 kcal');
    expect(p).toContain('140 g Protein');
    expect(p).toContain('abnehmen');
    expect(p).toContain('vegan');
    expect(p).toContain('["Gluten","Sellerie"]');
    expect(p).toContain('20 Minuten');
    expect(p).toContain('breakfast (~556 kcal)');
    expect(p).toContain('auf Deutsch');
  });

  it('fragt auf Englisch nach englischen Texten und Einheiten', () => {
    const p = buildMealPlanPrompt(prefs, targets, 'en');
    expect(p).toContain('auf Englisch');
    expect(p).toContain('"tbsp"');
  });

  it('Neu generieren nennt Mahlzeit, kcal und zu vermeidende Gerichte', () => {
    const p = buildRegenerateMealPrompt(prefs, 'dinner', 650, 40, ['Linsencurry'], 'de');
    expect(p).toContain('dinner, ca. 650 kcal');
    expect(p).toContain('40 g Protein');
    expect(p).toContain('["Linsencurry"]');
  });
});

describe('parseMealPlanResponse', () => {
  const response = JSON.stringify({
    days: [
      { meals: [meal('Porridge', 'breakfast'), meal('Bowl'), meal('Curry', 'dinner')] },
      { meals: [meal('Omelett', 'breakfast'), meal('Salat'), meal('Pasta', 'dinner')] },
      { meals: [meal('Zu viel')] },
    ],
  });

  it('liest Tage ab Startdatum und vergibt stabile IDs', () => {
    const plan = parseMealPlanResponse('```json\n' + response + '\n```', prefs, '2026-11-30');
    expect(plan.days).toHaveLength(2);
    expect(plan.days.map((d) => d.date)).toEqual(['2026-11-30', '2026-12-01']);
    expect(plan.days[1].meals.map((m) => m.id)).toEqual(['d1-m0', 'd1-m1', 'd1-m2']);
    expect(plan.days[0].meals[0]).toMatchObject({ slot: 'breakfast', name: 'Porridge', calories: 500, loggedAt: null });
    expect(plan.days[0].meals[0].ingredients[1]).toEqual({ name: 'Salz', amount: null, unit: '' });
    expect(plan.shoppingChecked).toEqual([]);
  });

  it('verträgt Text um das JSON herum', () => {
    expect(parseMealPlanResponse('Hier ist dein Plan: ' + response + ' Guten Appetit!', prefs, '2026-11-03').days).toHaveLength(2);
  });

  it('berechnet fehlende kcal aus den Makros und verwirft Mahlzeiten ohne Namen', () => {
    const raw = JSON.stringify({ days: [{ meals: [meal('Quark', 'snack', { calories: undefined }), meal('')] }] });
    const plan = parseMealPlanResponse(raw, { ...prefs, days: 1 }, '2026-11-03');
    expect(plan.days[0].meals).toHaveLength(1);
    expect(plan.days[0].meals[0].calories).toBe(30 * 4 + 50 * 4 + 15 * 9);
  });

  it('wirft bei unbrauchbarer Antwort', () => {
    expect(() => parseMealPlanResponse('kein json', prefs, '2026-11-03')).toThrow();
    expect(() => parseMealPlanResponse('{"days":[]}', prefs, '2026-11-03')).toThrow('invalid_plan');
    expect(() => parseMealPlanResponse('{"days":[{"meals":[]}]}', prefs, '2026-11-03')).toThrow('invalid_plan');
  });
});

describe('parseSingleMealResponse', () => {
  it('übernimmt ID und Mahlzeit-Typ des ersetzten Eintrags', () => {
    const m = parseSingleMealResponse(JSON.stringify(meal('Tofu-Pfanne', 'lunch')), 'd0-m2', 'dinner');
    expect(m).toMatchObject({ id: 'd0-m2', slot: 'dinner', name: 'Tofu-Pfanne' });
  });

  it('wirft ohne gültige Mahlzeit', () => {
    expect(() => parseSingleMealResponse('{}', 'x', 'lunch')).toThrow('invalid_meal');
  });
});

describe('Auswertung und Einkaufsliste', () => {
  const plan: MealPlanData = parseMealPlanResponse(
    JSON.stringify({
      days: [
        {
          meals: [
            meal('A', 'breakfast'),
            meal('B', 'lunch', { ingredients: [{ name: 'haferflocken', amount: 40, unit: 'G' }, { name: 'Ei', amount: 2, unit: 'Stück' }] }),
          ],
        },
      ],
    }),
    { ...prefs, days: 1 },
    '2026-11-03',
  );

  it('dayTotals summiert alle Mahlzeiten', () => {
    expect(dayTotals(plan.days[0])).toEqual({ calories: 1000, protein: 60, carbs: 100, fat: 30 });
  });

  it('replaceMeal ändert nur die gewünschte Mahlzeit', () => {
    const next = replaceMeal(plan, 'd0-m1', (m) => ({ ...m, loggedAt: '2026-11-03T12:00:00Z' }));
    expect(next.days[0].meals[1].loggedAt).toBe('2026-11-03T12:00:00Z');
    expect(next.days[0].meals[0].loggedAt).toBeNull();
    expect(plan.days[0].meals[1].loggedAt).toBeNull();
  });

  it('fasst gleiche Zutaten unabhängig von Groß-/Kleinschreibung zusammen', () => {
    const list = buildShoppingList(plan);
    expect(list.map((i) => i.name)).toEqual(['Ei', 'Haferflocken', 'Salz']);
    expect(list.find((i) => i.name === 'Haferflocken')).toMatchObject({ amount: 100, unit: 'g', uses: 2 });
    expect(list.find((i) => i.name === 'Salz')).toMatchObject({ amount: null, uses: 1 });
  });
});
