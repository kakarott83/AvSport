-- KI-Mahlzeitenplan (Tab „Speiseplan“, app/(app)/(tabs)/meal-plan.tsx).
-- Ein Plan = 1–7 Tage mit Mahlzeiten, Zutaten und Nährwerten als jsonb
-- (Aufbau: MealPlanData in lib/mealPlan.ts). „Als gegessen eintragen“ schreibt
-- zusätzlich einen normalen Eintrag in public.food_logs.

create table if not exists public.meal_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  start_date  date not null,
  days        smallint not null check (days between 1 and 7),
  -- MealPlanPreferences (Ernährungsform, Mahlzeiten/Tag, Unverträglichkeiten, Aufwand)
  preferences jsonb not null default '{}'::jsonb,
  -- Tagesziele zum Zeitpunkt der Erstellung: { kcal, protein, goal }
  targets     jsonb not null default '{}'::jsonb,
  plan        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists meal_plans_user_created on public.meal_plans (user_id, created_at desc);

alter table public.meal_plans enable row level security;
revoke all on public.meal_plans from anon;
grant select, insert, update, delete on public.meal_plans to authenticated;

drop policy if exists meal_plans_owner_all on public.meal_plans;
create policy meal_plans_owner_all on public.meal_plans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
