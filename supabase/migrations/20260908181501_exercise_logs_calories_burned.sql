-- Geschätzter Kalorienverbrauch pro protokolliertem Satz (MET-basiert, siehe
-- lib/calorieBurn.ts). Wird beim Beenden eines Satzes in app/(app)/active-workout.tsx
-- geschrieben und in hooks/useCalorieGoal.ts (computeCalorieGoal) sowie im
-- Dashboard (app/(app)/(tabs)/index.tsx) über die heutige Summe aufs Tagesziel
-- addiert – aber nur, wenn profiles.auto_adjust_calories aktiv ist.

alter table public.exercise_logs
  add column if not exists calories_burned integer not null default 0;
