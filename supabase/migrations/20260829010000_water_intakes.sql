-- Wasser-Tracking: ein Eintrag pro Trinkmenge (statt Tagessumme), damit
-- Verlauf und "Rückgängig machen" möglich sind. water_goal_ml ist die
-- manuelle Override-Option (analog profiles.manual_step_goal); ist sie
-- null, wird das Ziel aus dem Körpergewicht geschätzt (siehe lib/waterGoal.ts).

create table if not exists public.water_intakes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  ml         integer not null check (ml > 0),
  created_at timestamptz not null default now()
);

create index if not exists water_intakes_user_created_idx
  on public.water_intakes (user_id, created_at);

alter table public.profiles
  add column if not exists water_goal_ml integer;
