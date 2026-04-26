/**
 * Shared fixture data for Supabase mock responses.
 *
 * Import in test files to build deterministic mock return values:
 *
 *   import { profileFixture, logFixtures, mealFixtures } from '@/__mocks__/supabase-fixtures';
 */

import type { FoodLog } from '@/lib/nutrition';
import type { LogRow, Tag }  from '@/lib/calendar';

// ── Profile ────────────────────────────────────────────────────────────────────

export const profileFixture = {
  id:                     'test-user-id',
  display_name:           'Test User',
  gender:                 'female'  as const,
  date_of_birth:          '1995-03-01',
  height_cm:              170,
  weight_kg:              65,
  manual_calorie_offset:  0,
  protein_per_kg:         2.0,
  auto_adjust_calories:   false,
  cycle_tracking_enabled: true,
  cycle_length_days:      28,
  period_duration_days:   5,
  cycle_calorie_bonus:    250,
};

// ── Daily logs ─────────────────────────────────────────────────────────────────

/** A log row with the "period" tag — 18 days ago (inside luteal window). */
export const periodLogFixture: LogRow = {
  date:    new Date(Date.now() - 18 * 86_400_000).toISOString().slice(0, 10),
  tag_ids: ['period'],
  note:    null,
};

/** A log row with a note but no tags. */
export const noteOnlyLogFixture: LogRow = {
  date:    '2026-04-10',
  tag_ids: [],
  note:    'Guter Tag',
};

/** All standard tags from calendar DEFAULT_TAGS. */
export const defaultTagsFixture: Tag[] = [
  { id: 'no_alcohol', label: 'Kein Alkohol', emoji: '🍷', color: '#00E5FF' },
  { id: 'period',     label: 'Periode',      emoji: '🩸', color: '#FF5252' },
  { id: 'stress',     label: 'Viel Stress',  emoji: '🤯', color: '#FF9100' },
];

// ── Food logs ──────────────────────────────────────────────────────────────────

/** A normal meal with all macros populated. */
export const fullMealFixture: FoodLog = {
  id:         'meal-1',
  meal_name:  'Haferflocken',
  calories:   350,
  protein:    12,
  carbs:      55,
  fat:        6,
  created_at: '2026-04-12T08:00:00Z',
};

/** A meal with all null macro fields (only calories tracked). */
export const caloriesOnlyMealFixture: FoodLog = {
  id:         'meal-2',
  meal_name:  'Banane',
  calories:   90,
  protein:    null,
  carbs:      null,
  fat:        null,
  created_at: '2026-04-12T10:00:00Z',
};

/** A meal logged with 0 kcal (e.g. black coffee). */
export const zeroCalMealFixture: FoodLog = {
  id:         'meal-3',
  meal_name:  'Schwarzer Kaffee',
  calories:   0,
  protein:    0,
  carbs:      0,
  fat:        0,
  created_at: '2026-04-12T07:00:00Z',
};
