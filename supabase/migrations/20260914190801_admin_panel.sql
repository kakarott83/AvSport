-- Backend für das externe Admin-Panel (admin-site/, gehostet z. B. auf Strato)
-- und die zugehörige Edge Function supabase/functions/admin-api.
--
-- Sicherheitsmodell (bewusst mehrschichtig):
--   1. public.admins listet die User-IDs mit Admin-Zugriff. RLS aktiv, KEINE
--      Policies → weder anon noch authenticated können die Tabelle je lesen
--      oder schreiben, nur postgres/service_role.
--   2. Die Edge Function prüft das JWT des Aufrufers gegen public.admins,
--      BEVOR sie irgendeine der Funktionen unten aufruft.
--   3. Die Funktionen selbst sind zusätzlich per REVOKE/GRANT nur für
--      service_role ausführbar — selbst ein gültiges User-JWT reicht ohne die
--      Edge Function (bzw. ohne service_role-Key) nicht, um sie aufzurufen.
--   4. SECURITY DEFINER + festes search_path verhindert Schema-Hijacking.

-- ── Admin-Liste ──────────────────────────────────────────────────────────────

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- av@test.de ist der bestehende interne Test-/Dev-Account (siehe
-- UNLIMITED_PROMPT_EMAILS in services/gemini/client.ts) — wird als erster
-- Admin gesetzt. Weitere Admins: insert into public.admins (user_id) values (...).
insert into public.admins (user_id)
select id from auth.users where email = 'av@test.de'
on conflict do nothing;

-- ── Feedback: "erledigt"-Status für die Admin-Ansicht ───────────────────────

alter table public.feedback
  add column if not exists handled boolean not null default false;

-- ── RPCs: nur für service_role aufrufbar (siehe Edge Function admin-api) ────

create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, analytics, pg_temp
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'daily_active_users', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select * from analytics.daily_active_users order by activity_date desc limit 30
      ) t
    ),
    'retention_buckets', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from analytics.retention_buckets t
    ),
    'feature_adoption', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from analytics.feature_adoption t
    ),
    'plan_creation_stats', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select * from analytics.plan_creation_stats order by week desc limit 12
      ) t
    ),
    'premium_overview', (
      select to_jsonb(t) from analytics.premium_overview t
    ),
    'premium_product_breakdown', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from analytics.premium_product_breakdown t
    ),
    'ai_cost_by_user_this_month', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from analytics.ai_cost_by_user_this_month t
    ),
    'ai_daily_stats', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select * from analytics.ai_daily_stats order by day desc limit 14
      ) t
    ),
    'ai_errors_recent', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select * from analytics.ai_errors_recent limit 20
      ) t
    ),
    'external_api_calls', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select * from analytics.external_api_calls order by day desc limit 30
      ) t
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_get_dashboard() from public, anon, authenticated;
grant execute on function public.admin_get_dashboard() to service_role;

create or replace function public.admin_list_feedback(only_unhandled boolean default false)
returns setof public.feedback
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.feedback
  where (not only_unhandled) or (handled is not true)
  order by created_at desc
  limit 200;
$$;
revoke all on function public.admin_list_feedback(boolean) from public, anon, authenticated;
grant execute on function public.admin_list_feedback(boolean) to service_role;

create or replace function public.admin_set_feedback_handled(feedback_id uuid, is_handled boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.feedback set handled = is_handled where id = feedback_id;
$$;
revoke all on function public.admin_set_feedback_handled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_feedback_handled(uuid, boolean) to service_role;

create or replace function public.admin_list_users()
returns setof analytics.user_activity_summary
language sql
security definer
set search_path = public, analytics, pg_temp
as $$
  select * from analytics.user_activity_summary order by signed_up_at desc limit 500;
$$;
revoke all on function public.admin_list_users() from public, anon, authenticated;
grant execute on function public.admin_list_users() to service_role;

-- Manuelle Premium-Vergabe/-Entzug (z. B. Support-Fälle, Comp-Accounts).
-- Achtung: kollidiert potenziell mit dem RevenueCat-Webhook, der is_premium
-- beim nächsten echten Store-Event überschreibt — für dauerhafte Comp-Accounts
-- ggf. zusätzlich in RevenueCat selbst ein Entitlement vergeben.
create or replace function public.admin_set_premium(target_user_id uuid, make_premium boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles
  set
    is_premium = make_premium,
    premium_product = case when make_premium then coalesce(premium_product, 'manual_admin_grant') else null end,
    premium_until = case when make_premium then premium_until else null end
  where id = target_user_id;
$$;
revoke all on function public.admin_set_premium(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_premium(uuid, boolean) to service_role;
