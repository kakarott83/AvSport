-- Englischer Übungsname (von Gemini), genutzt für die Übungsbildsuche gegen die
-- free-exercise-db — siehe services/exerciseDb/exerciseImage.ts.

alter table public.plan_exercises
  add column if not exists name_en text;
