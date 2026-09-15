-- Row Level Security für alle bislang ungeschützten public-Tabellen.
--
-- Vorher waren diese Tabellen mit dem anon-Key vollständig les- und schreibbar
-- (Supabase-Advisory "rls_disabled"). Zugriffsmodell:
--   * Nutzer-eigene Tabellen  → Zeile gehört auth.uid() == user_id
--   * plan_exercises/plan_days → Besitz erbt vom übergeordneten workout_plans
--   * exercises_master         → geteilte, schreibgeschützte Referenzdaten
--   * ai_logs                  → nur eigene Logs lesen/schreiben (Tageslimit)
--
-- Edge Functions (send-feedback, revenuecat-webhook) nutzen den Service-Role-Key
-- und umgehen RLS – hier nicht betroffen.

-- ── Nutzer-eigene Tabellen: volle CRUD auf eigene Zeilen ─────────────────────

alter table public.user_stats enable row level security;
drop policy if exists user_stats_owner_all on public.user_stats;
create policy user_stats_owner_all on public.user_stats
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.workouts enable row level security;
drop policy if exists workouts_owner_all on public.workouts;
create policy workouts_owner_all on public.workouts
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.exercise_logs enable row level security;
drop policy if exists exercise_logs_owner_all on public.exercise_logs;
create policy exercise_logs_owner_all on public.exercise_logs
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.workout_plans enable row level security;
drop policy if exists workout_plans_owner_all on public.workout_plans;
create policy workout_plans_owner_all on public.workout_plans
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.food_logs enable row level security;
drop policy if exists food_logs_owner_all on public.food_logs;
create policy food_logs_owner_all on public.food_logs
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.body_measurements enable row level security;
drop policy if exists body_measurements_owner_all on public.body_measurements;
create policy body_measurements_owner_all on public.body_measurements
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.food_scans enable row level security;
drop policy if exists food_scans_owner_all on public.food_scans;
create policy food_scans_owner_all on public.food_scans
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.water_intakes enable row level security;
drop policy if exists water_intakes_owner_all on public.water_intakes;
create policy water_intakes_owner_all on public.water_intakes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── ai_logs: nur eigene Logs (Tageslimit-Check + Persistenz in client.ts) ────

alter table public.ai_logs enable row level security;
drop policy if exists "Users can insert their own logs" on public.ai_logs;
drop policy if exists ai_logs_owner_insert on public.ai_logs;
drop policy if exists ai_logs_owner_select on public.ai_logs;
create policy ai_logs_owner_insert on public.ai_logs
  for insert to authenticated with check (auth.uid() = user_id);
create policy ai_logs_owner_select on public.ai_logs
  for select to authenticated using (auth.uid() = user_id);

-- ── plan_exercises / plan_days: Besitz über workout_plans ───────────────────

alter table public.plan_exercises enable row level security;
drop policy if exists plan_exercises_owner_all on public.plan_exercises;
create policy plan_exercises_owner_all on public.plan_exercises
  for all to authenticated
  using (exists (
    select 1 from public.workout_plans wp
    where wp.id = plan_exercises.plan_id and wp.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workout_plans wp
    where wp.id = plan_exercises.plan_id and wp.user_id = auth.uid()
  ));

alter table public.plan_days enable row level security;
drop policy if exists plan_days_owner_all on public.plan_days;
create policy plan_days_owner_all on public.plan_days
  for all to authenticated
  using (exists (
    select 1 from public.workout_plans wp
    where wp.id = plan_days.plan_id and wp.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workout_plans wp
    where wp.id = plan_days.plan_id and wp.user_id = auth.uid()
  ));

-- ── exercises_master: geteilte Referenzdaten, für alle Angemeldeten lesbar ───

alter table public.exercises_master enable row level security;
drop policy if exists exercises_master_read on public.exercises_master;
create policy exercises_master_read on public.exercises_master
  for select to authenticated using (true);
