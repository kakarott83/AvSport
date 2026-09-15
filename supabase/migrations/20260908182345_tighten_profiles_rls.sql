-- profiles: die bestehenden Policies waren komplett offen (qual/with_check = true).
-- Damit konnte jeder eingeloggte Nutzer fremde Profile lesen UND verändern –
-- inkl. Gewicht, Geburtsdatum, Zyklusdaten und Premium-Status.
--
-- Die App greift ausschließlich mit .eq('id', user.id) bzw. upsert({ id: user.id })
-- zu. Der RevenueCat-Webhook (supabase/functions/revenuecat-webhook) nutzt den
-- Service-Role-Key und umgeht RLS. Profile-Zeilen werden allein per Client-Upsert
-- im Onboarding angelegt (kein auth.users-Trigger).

drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Enable update for all users"               on public.profiles;
drop policy if exists "Enable insert for all users"               on public.profiles;
drop policy if exists "Users can insert their own profile."       on public.profiles;

drop policy if exists profiles_owner_select on public.profiles;
drop policy if exists profiles_owner_insert on public.profiles;
drop policy if exists profiles_owner_update on public.profiles;

create policy profiles_owner_select on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy profiles_owner_insert on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy profiles_owner_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
