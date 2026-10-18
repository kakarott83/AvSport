-- KI-Piktogramme zur Übungsausführung (supabase/functions/exercise-pictogram).
-- Pro Übung (normalisierter englischer Name = slug) wird einmalig ein Bild
-- erzeugt, im öffentlichen Bucket "exercise-pictograms" abgelegt und danach
-- für alle Nutzer wiederverwendet. Schreiben nur über die Edge Function
-- (service_role); RLS ohne Policies = kein Direktzugriff aus der App.

create table if not exists public.exercise_pictograms (
  slug        text primary key,
  name_en     text,
  name_de     text,
  model       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists exercise_pictograms_created_by_idx
  on public.exercise_pictograms (created_by, created_at desc);

alter table public.exercise_pictograms enable row level security;

-- Öffentlicher Bucket: Bilder per URL lesbar, Upload nur mit service_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-pictograms', 'exercise-pictograms', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true;
