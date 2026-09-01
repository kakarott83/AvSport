-- KI-generierte Detailtexte pro Übung (Wirkung/Technik, Anleitung, Modifikationen,
-- Sicherheitshinweis, Tipps) — siehe services/gemini/exerciseDetailProvider.ts.

alter table public.plan_exercises
  add column if not exists short           text,
  add column if not exists detail_markdown text,
  add column if not exists instructions    jsonb,
  add column if not exists modifications   jsonb,
  add column if not exists safety          text,
  add column if not exists tips            jsonb,
  add column if not exists video_url       text;
