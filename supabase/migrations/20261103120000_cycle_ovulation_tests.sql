-- Ovulationstests (LH) für den Zykluskalender: eine Zeile pro Tag und Nutzerin.
-- Quelle: manuell in der App (CyclePanel) oder aus Apple Health /
-- Health Connect (services/cycleHealthSync.ts, source = 'health').
-- Ein positiver Test verschiebt den Eisprung des Zyklus auf den Folgetag
-- (lib/cycle.ts → confirmedOvulationDate). Mehrere Tests am selben Tag werden
-- im Client zusammengefasst (positiv gewinnt).
--
-- result: positive = LH-Anstieg · estrogen = Östrogen-Anstieg ("hohe
-- Fruchtbarkeit" bei digitalen Tests) · indeterminate = unklar · negative

create table if not exists public.cycle_ovulation_tests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  result     text not null check (result in ('positive', 'negative', 'indeterminate', 'estrogen')),
  source     text not null default 'manual' check (source in ('manual', 'health')),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists cycle_ovulation_tests_user_date_idx
  on public.cycle_ovulation_tests (user_id, date);

alter table public.cycle_ovulation_tests enable row level security;
revoke all on public.cycle_ovulation_tests from anon;

drop policy if exists cycle_ovulation_tests_owner_select on public.cycle_ovulation_tests;
drop policy if exists cycle_ovulation_tests_owner_insert on public.cycle_ovulation_tests;
drop policy if exists cycle_ovulation_tests_owner_update on public.cycle_ovulation_tests;
drop policy if exists cycle_ovulation_tests_owner_delete on public.cycle_ovulation_tests;

create policy cycle_ovulation_tests_owner_select on public.cycle_ovulation_tests
  for select to authenticated using (auth.uid() = user_id);
create policy cycle_ovulation_tests_owner_insert on public.cycle_ovulation_tests
  for insert to authenticated with check (auth.uid() = user_id);
create policy cycle_ovulation_tests_owner_update on public.cycle_ovulation_tests
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cycle_ovulation_tests_owner_delete on public.cycle_ovulation_tests
  for delete to authenticated using (auth.uid() = user_id);
