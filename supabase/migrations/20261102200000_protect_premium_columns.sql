-- Premium-Status vor Änderungen durch den Client schützen.
--
-- Die Policy profiles_owner_update erlaubt Nutzer:innen, ihr eigenes Profil zu
-- ändern — bisher inklusive is_premium / premium_until / premium_product. Mit
-- dem öffentlichen anon-Key und dem eigenen Login reichte ein PATCH auf
-- /rest/v1/profiles, um sich selbst Premium zu geben (ai_quota_status() wertet
-- is_premium aus → Premium-KI-Limits ohne Abo).
--
-- Gesetzt werden diese Spalten nur serverseitig:
--   - supabase/functions/revenuecat-webhook (service_role)
--   - admin_set_premium() (security definer, Owner postgres; nur service_role)
-- Die App schreibt sie nie. Der Trigger lässt Änderungen daher nur zu, wenn sie
-- nicht von den Client-Rollen anon/authenticated kommen; sonst bleiben die
-- alten Werte (UPDATE) bzw. die Standardwerte (INSERT) stehen.

create or replace function public.protect_premium_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_premium      := false;
    new.premium_until   := null;
    new.premium_product := null;
  else
    new.is_premium      := old.is_premium;
    new.premium_until   := old.premium_until;
    new.premium_product := old.premium_product;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_premium_columns() from public, anon, authenticated;

drop trigger if exists protect_premium_columns on public.profiles;
create trigger protect_premium_columns
  before insert or update on public.profiles
  for each row execute function public.protect_premium_columns();
