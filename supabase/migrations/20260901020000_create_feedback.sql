-- App-Feedback der Nutzer. Wird von der Edge Function `send-feedback`
-- (service_role) geschrieben und danach best-effort per E-Mail an das
-- Support-Postfach geschickt (`emailed` = ob der Mailversand geklappt hat).
--
-- RLS ist aktiv ohne Policy → nur service_role (Edge Function) hat Zugriff;
-- normale Clients können weder lesen noch schreiben. Auswertung im Dashboard.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  subject     text not null,
  message     text not null,
  app_version text,
  platform    text,
  emailed     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
