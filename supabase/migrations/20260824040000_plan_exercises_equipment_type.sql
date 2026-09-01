-- Ausrüstungstyp pro Übung (z. B. "Langhantel", "Maschine", "Körpergewicht") für die
-- Klammer-Anzeige "[Muskelgruppe / Ausrüstung]" im Coach-Wizard und beim Training.

alter table public.plan_exercises
  add column if not exists equipment_type text;
