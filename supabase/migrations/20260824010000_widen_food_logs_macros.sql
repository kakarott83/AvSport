-- food_logs.protein/carbs/fat waren als integer angelegt, die Nährwert-Analyse
-- (services/gemini/nutritionProvider.ts) liefert Makros aber auf eine Nachkommastelle
-- gerundet (z.B. 8.2g). Jeder Insert mit Nachkommastelle schlug bisher fehl:
-- "invalid input syntax for type integer" — Foto-Scans wurden dadurch nie gespeichert.

alter table public.food_logs
  alter column protein type numeric(6,1),
  alter column carbs   type numeric(6,1),
  alter column fat     type numeric(6,1);
