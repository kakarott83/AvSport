-- Tabelle für Kosten-Tracking der zweistufigen Nährwertanalyse
-- call_type: 'cache_hit' | 'usda' | 'usda_fallback' | 'llm_fallback'

create table if not exists public.nutrition_cost_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  call_type  text        not null,
  item_name  text,
  created_at timestamptz not null default now()
);

-- Nur eigene Zeilen sichtbar
alter table public.nutrition_cost_logs enable row level security;

create policy "Eigene Logs lesen"
  on public.nutrition_cost_logs for select
  using (auth.uid() = user_id);

create policy "Eigene Logs schreiben"
  on public.nutrition_cost_logs for insert
  with check (auth.uid() = user_id);

-- Index für Dashboard-Abfragen (z.B. GROUP BY call_type pro Tag)
create index nutrition_cost_logs_user_created
  on public.nutrition_cost_logs (user_id, created_at desc);
