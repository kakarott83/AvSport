-- Multi-Tage-Trainingspläne: bisher hatte ein workout_plans-Datensatz genau EINE
-- flache plan_exercises-Liste, die für jeden gewählten scheduled_day identisch war.
-- Ab jetzt kann ein Plan in Tage (Day 1..N, z.B. Push/Pull/Beine) aufgeteilt werden,
-- jeder Tag mit eigenen Übungen, Warmup/Cooldown.
--
-- Rückwärtskompatibilität: plan_exercises.day_id bleibt nullable — bestehende
-- Pläne sowie der manuelle Plan-Editor (create-plan.tsx) können weiterhin ohne
-- Tage arbeiten (day_id = null bedeutet "gilt für jeden Trainingstag").

alter table public.workout_plans
  add column if not exists environment       text check (environment in ('gym', 'home')),
  add column if not exists equipment         text[] not null default '{}'::text[],
  add column if not exists restrictions      text,
  add column if not exists progression_notes text,
  add column if not exists fitness_level     text;

create table if not exists public.plan_days (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.workout_plans(id) on delete cascade,
  day_index  integer not null,
  label      text not null,
  warmup     text,
  cooldown   text,
  created_at timestamptz not null default now(),
  unique (plan_id, day_index)
);

alter table public.plan_exercises
  add column if not exists day_id       uuid references public.plan_days(id) on delete cascade,
  add column if not exists rest_seconds integer;

create index if not exists plan_days_plan_id on public.plan_days (plan_id);
create index if not exists plan_exercises_day_id on public.plan_exercises (day_id);
