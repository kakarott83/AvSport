const USDA_API_KEY   = process.env.EXPO_PUBLIC_USDA_API_KEY ?? 'DEMO_KEY';
const USDA_SEARCH    = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Standard nutrient IDs — consistent across Foundation + SR Legacy data types
const NID_CALORIES = 1008; // Energy (kcal)
const NID_PROTEIN  = 1003; // Protein (g)
const NID_FAT      = 1004; // Total lipid / fat (g)
const NID_CARBS    = 1005; // Carbohydrate, by difference (g)

export interface Macros {
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

export type USDASource = 'usda' | 'usda_fallback';

interface USDANutrient {
  nutrientId:   number;
  nutrientName: string;
  value:        number;
}

interface USDAFood {
  fdcId:         number;
  description:   string;
  foodNutrients: USDANutrient[];
}

async function searchUSDA(query: string): Promise<USDAFood | null> {
  const params = new URLSearchParams({
    query,
    api_key:  USDA_API_KEY,
    pageSize: '5',
    dataType: 'Foundation,SR Legacy',
  });

  const res = await fetch(`${USDA_SEARCH}?${params}`);
  if (!res.ok) throw new Error(`USDA HTTP ${res.status}`);

  const data = await res.json() as { foods?: USDAFood[] };
  return data.foods?.[0] ?? null;
}

function extractPer100g(food: USDAFood): Macros {
  const v = (id: number) =>
    food.foodNutrients.find(n => n.nutrientId === id)?.value ?? 0;
  return {
    calories: v(NID_CALORIES),
    protein:  v(NID_PROTEIN),
    carbs:    v(NID_CARBS),
    fat:      v(NID_FAT),
  };
}

function scale(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    calories: Math.round(per100g.calories * f),
    protein:  Math.round(per100g.protein  * f * 10) / 10,
    carbs:    Math.round(per100g.carbs    * f * 10) / 10,
    fat:      Math.round(per100g.fat      * f * 10) / 10,
  };
}

/**
 * Lookup nutritional values for a food item via USDA FoodData Central.
 *
 * Strategy:
 *  1. Search with name + preparation (e.g. "chicken breast grilled")
 *  2. If no hit: search name only (e.g. "chicken breast")
 *  Returns null if both searches yield no results.
 */
export async function lookupNutrients(
  name: string,
  preparation: string,
  grams: number,
): Promise<{ macros: Macros; source: USDASource } | null> {
  // Try 1: specific query with preparation
  const q1   = preparation ? `${name} ${preparation}` : name;
  let food = await searchUSDA(q1);
  if (food) {
    return { macros: scale(extractPer100g(food), grams), source: 'usda' };
  }

  // Try 2: name only (if preparation was included above)
  if (preparation) {
    food = await searchUSDA(name);
    if (food) {
      return { macros: scale(extractPer100g(food), grams), source: 'usda_fallback' };
    }
  }

  return null;
}
