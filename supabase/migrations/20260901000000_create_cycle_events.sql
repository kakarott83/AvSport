-- Zyklus-/Perioden-Tracking: eine Zeile pro erfasstem Blutungstag.
-- Der erste Tag einer zusammenhängenden Blutungsserie (Lücke <= 1 Tag) gilt
-- als Zyklusstag 1 = Beginn eines neuen Zyklus. Die Serienbildung und die
-- Phasenberechnung passieren im Client (lib/cycle.ts) — diese Tabelle hält
-- nur die Rohdaten.
--
-- flow: 1 = leicht … 4 = stark (Spotting bis starke Blutung).

create table if not exists public.cycle_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  flow       smallint not null default 2 check (flow between 1 and 4),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists cycle_events_user_date_idx
  on public.cycle_events (user_id, date);

-- Nur eigene Zeilen sichtbar/schreibbar
alter table public.cycle_events enable row level security;

drop policy if exists "cycle_events_owner_select" on public.cycle_events;
drop policy if exists "cycle_events_owner_insert" on public.cycle_events;
drop policy if exists "cycle_events_owner_update" on public.cycle_events;
drop policy if exists "cycle_events_owner_delete" on public.cycle_events;

create policy "cycle_events_owner_select"
  on public.cycle_events for select
  using (auth.uid() = user_id);

create policy "cycle_events_owner_insert"
  on public.cycle_events for insert
  with check (auth.uid() = user_id);

create policy "cycle_events_owner_update"
  on public.cycle_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cycle_events_owner_delete"
  on public.cycle_events for delete
  using (auth.uid() = user_id);

-- Best-effort-Backfill aus dem bestehenden 'period'-Tag im Kalender-Tab
-- (daily_logs.tags ist text[]).
insert into public.cycle_events (user_id, date, flow)
select user_id, date, 2
from public.daily_logs
where 'period' = any(tags)
on conflict (user_id, date) do nothing;
