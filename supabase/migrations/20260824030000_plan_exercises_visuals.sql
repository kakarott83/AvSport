-- Kompakte, visuell erkennbare Übungsdarstellung für den KI-Coach:
-- Icon (Emoji als Piktogramm), kurze Bewegungsbeschreibung, Zielmuskelgruppe.

alter table public.plan_exercises
  add column if not exists icon         text,
  add column if not exists description  text,
  add column if not exists muscle_group text;
