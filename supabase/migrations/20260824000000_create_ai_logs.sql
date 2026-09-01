-- Tabelle für Kosten-/Nutzungs-Tracking aller Gemini-Aufrufe (services/gemini/client.ts)
-- Wird u.a. für das tägliche Anfragelimit pro User verwendet.

create table if not exists public.ai_logs (
  id                 bigint generated always as identity primary key,
  user_id            uuid references auth.users(id) on delete set null,
  model              text        not null,
  status             text        not null,
  prompt_tokens      integer,
  completion_tokens  integer,
  total_tokens       integer,
  error_message      text,
  created_at         timestamptz not null default now()
);

-- Nur eigene Zeilen sichtbar
alter table public.ai_logs enable row level security;

create policy "Eigene Logs lesen"
  on public.ai_logs for select
  using (auth.uid() = user_id);

create policy "Eigene Logs schreiben"
  on public.ai_logs for insert
  with check (auth.uid() = user_id);

-- Index für das tägliche Anfragelimit (COUNT pro User seit Tagesbeginn)
create index if not exists ai_logs_user_created
  on public.ai_logs (user_id, created_at desc);
