-- Kalorienziel-Richtung (Abnehmen / Halten / Muskelaufbau). Wird in
-- hooks/useCalorieGoal.ts (CALORIE_GOAL_ADJUSTMENT) auf den Grundbedarf
-- aufgeschlagen; manual_calorie_offset bleibt als zusätzliche Feinjustierung.
alter table public.profiles
  add column if not exists calorie_goal text not null default 'maintain'
  check (calorie_goal in ('lose', 'maintain', 'gain'));
