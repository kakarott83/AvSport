-- Serverseitige Nutzungs-Limits für die KI-Funktionen + Steuerung im Admin-Panel.
--
-- Bisher hat die App Gemini direkt aufgerufen und das Tageslimit / den
-- Premium-Kosten-Deckel nur im Client geprüft (services/gemini/client.ts) —
-- umgehbar mit dem im App-Bundle enthaltenen API-Key. Ab jetzt läuft jeder
-- KI-Aufruf über die Edge Function supabase/functions/ai-proxy, die vor jedem
-- Request public.ai_quota_status() fragt und das Ergebnis selbst in ai_logs
-- schreibt.
--
-- Limit-Modell:
--   * public.ai_limit_defaults  — Standard-Limits je Tarif (free / premium).
--   * public.user_limits        — optionale Overrides pro User. NULL in einer
--                                 Limit-Spalte = Tarif-Standard verwenden.
--                                 Dazu: unbegrenzt, KI gesperrt, Zähler-Reset.
--   * Gezählt werden nur erfolgreiche Anfragen (status = 'success'); Tages- und
--     Monatsgrenzen in Europe/Berlin.
--
-- Alles hier ist wie in 20260914190801_admin_panel.sql nur für service_role
-- erreichbar (RLS ohne Policies + REVOKE/GRANT).

-- ── Tabellen ────────────────────────────────────────────────────────────────

create table if not exists public.ai_limit_defaults (
  tier                  text primary key check (tier in ('free', 'premium')),
  daily_request_limit   integer check (daily_request_limit >= 0),
  monthly_request_limit integer check (monthly_request_limit >= 0),
  monthly_cost_cap_usd  numeric(10, 4) check (monthly_cost_cap_usd >= 0),
  updated_at            timestamptz not null default now()
);
alter table public.ai_limit_defaults enable row level security;
revoke all on public.ai_limit_defaults from anon, authenticated;

-- Entspricht dem bisherigen Verhalten in services/gemini/client.ts:
-- free = 10 Anfragen/Tag, premium = 10 $/Monat Kosten-Deckel.
insert into public.ai_limit_defaults (tier, daily_request_limit, monthly_request_limit, monthly_cost_cap_usd)
values ('free', 10, null, null), ('premium', null, null, 10)
on conflict (tier) do nothing;

create table if not exists public.user_limits (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  daily_request_limit   integer check (daily_request_limit >= 0),
  monthly_request_limit integer check (monthly_request_limit >= 0),
  monthly_cost_cap_usd  numeric(10, 4) check (monthly_cost_cap_usd >= 0),
  unlimited             boolean not null default false,
  ai_blocked            boolean not null default false,
  blocked_reason        text,
  usage_reset_at        timestamptz,
  note                  text,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null
);
alter table public.user_limits enable row level security;
revoke all on public.user_limits from anon, authenticated;

-- Bisherige Allowlist UNLIMITED_PROMPT_EMAILS aus client.ts übernehmen.
insert into public.user_limits (user_id, unlimited, note)
select id, true, 'Interner Test-Account (früher UNLIMITED_PROMPT_EMAILS)'
from auth.users where email = 'av@test.de'
on conflict (user_id) do nothing;

create table if not exists public.admin_audit_log (
  id             bigint generated always as identity primary key,
  admin_id       uuid references auth.users(id) on delete set null,
  admin_email    text,
  action         text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details        jsonb,
  created_at     timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
create index if not exists admin_audit_log_created on public.admin_audit_log (created_at desc);

-- Welche App-Funktion die Anfrage ausgelöst hat (food_photo, training_plan, …).
alter table public.ai_logs add column if not exists feature text;

-- ── Quota-Prüfung (von ai-proxy vor jedem Request aufgerufen) ──────────────

create or replace function public.ai_quota_status(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz          constant text := 'Europe/Berlin';
  v_day_start   timestamptz := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_month_start timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_premium     boolean;
  v_lim         public.user_limits%rowtype;
  v_def         public.ai_limit_defaults%rowtype;
  v_reset       timestamptz;
  v_used_today  integer;
  v_used_month  integer;
  v_cost_month  numeric;
  v_daily       integer;
  v_monthly     integer;
  v_cap         numeric;
  v_unlimited   boolean;
  v_blocked     boolean;
  v_reason      text;
begin
  select coalesce(p.is_premium, false) into v_premium from public.profiles p where p.id = p_user_id;
  v_premium := coalesce(v_premium, false);

  select * into v_lim from public.user_limits where user_id = p_user_id;
  select * into v_def from public.ai_limit_defaults
    where tier = case when v_premium then 'premium' else 'free' end;

  v_reset := coalesce(v_lim.usage_reset_at, '-infinity'::timestamptz);

  select
    count(*) filter (where created_at >= greatest(v_day_start, v_reset)),
    count(*) filter (where created_at >= greatest(v_month_start, v_reset)),
    coalesce(sum(cost_usd) filter (where created_at >= greatest(v_month_start, v_reset)), 0)
  into v_used_today, v_used_month, v_cost_month
  from public.ai_logs
  where user_id = p_user_id and status = 'success' and created_at >= v_month_start;

  v_daily     := coalesce(v_lim.daily_request_limit, v_def.daily_request_limit);
  v_monthly   := coalesce(v_lim.monthly_request_limit, v_def.monthly_request_limit);
  v_cap       := coalesce(v_lim.monthly_cost_cap_usd, v_def.monthly_cost_cap_usd);
  v_unlimited := coalesce(v_lim.unlimited, false);
  v_blocked   := coalesce(v_lim.ai_blocked, false);

  v_reason := case
    when v_blocked then 'blocked'
    when v_unlimited then null
    when v_daily is not null and v_used_today >= v_daily then 'daily_limit'
    when v_monthly is not null and v_used_month >= v_monthly then 'monthly_limit'
    when v_cap is not null and v_cost_month >= v_cap then 'monthly_cost_cap'
    else null
  end;

  return jsonb_build_object(
    'allowed', v_reason is null,
    'reason', v_reason,
    'tier', case when v_premium then 'premium' else 'free' end,
    'unlimited', v_unlimited,
    'blocked', v_blocked,
    'blocked_reason', v_lim.blocked_reason,
    'used_today', v_used_today,
    'used_month', v_used_month,
    'cost_month_usd', round(v_cost_month, 4),
    'daily_limit', v_daily,
    'monthly_limit', v_monthly,
    'monthly_cost_cap_usd', v_cap,
    'has_override', v_lim.user_id is not null,
    'usage_reset_at', v_lim.usage_reset_at,
    'daily_resets_at', (date_trunc('day', now() at time zone v_tz) + interval '1 day') at time zone v_tz,
    'monthly_resets_at', (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz
  );
end;
$$;
revoke all on function public.ai_quota_status(uuid) from public, anon, authenticated;
grant execute on function public.ai_quota_status(uuid) to service_role;

-- ── Admin: Übersicht & Detail ──────────────────────────────────────────────

create or replace function public.admin_list_user_usage()
returns jsonb
language sql
stable
security definer
set search_path = public, analytics, pg_temp
as $$
  select coalesce(jsonb_agg(row_data order by signed_up_at desc), '[]'::jsonb)
  from (
    select
      u.created_at as signed_up_at,
      jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'signed_up_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'banned_until', u.banned_until,
        'is_premium', coalesce(p.is_premium, false),
        'premium_product', p.premium_product,
        'premium_until', p.premium_until,
        'last_activity_at', s.last_activity_at,
        'active_days', coalesce(s.active_days, 0),
        'requests_7d', (
          select count(*) from public.ai_logs l
          where l.user_id = u.id and l.status = 'success' and l.created_at >= now() - interval '7 days'
        ),
        'errors_7d', (
          select count(*) from public.ai_logs l
          where l.user_id = u.id and l.status = 'error' and l.created_at >= now() - interval '7 days'
        ),
        'last_request_at', (select max(l.created_at) from public.ai_logs l where l.user_id = u.id),
        'note', ul.note,
        'quota', public.ai_quota_status(u.id)
      ) as row_data
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_limits ul on ul.user_id = u.id
    left join analytics.user_activity_summary s on s.user_id = u.id
    order by u.created_at desc
    limit 2000
  ) t;
$$;
revoke all on function public.admin_list_user_usage() from public, anon, authenticated;
grant execute on function public.admin_list_user_usage() to service_role;

create or replace function public.admin_get_user_usage(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'user', (
      select jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'signed_up_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'banned_until', u.banned_until,
        'is_premium', coalesce(p.is_premium, false),
        'premium_product', p.premium_product,
        'premium_until', p.premium_until
      )
      from auth.users u left join public.profiles p on p.id = u.id
      where u.id = p_user_id
    ),
    'overrides', (select to_jsonb(ul) from public.user_limits ul where ul.user_id = p_user_id),
    'quota', public.ai_quota_status(p_user_id),
    'daily', (
      select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb) from (
        select
          (l.created_at at time zone 'Europe/Berlin')::date as day,
          count(*) filter (where l.status = 'success') as requests,
          count(*) filter (where l.status = 'error') as errors,
          round(coalesce(sum(l.cost_usd), 0), 4) as cost_usd
        from public.ai_logs l
        where l.user_id = p_user_id and l.created_at >= now() - interval '30 days'
        group by 1
      ) d
    ),
    'by_feature', (
      select coalesce(jsonb_agg(f order by f.requests desc), '[]'::jsonb) from (
        select
          coalesce(l.feature, 'unbekannt') as feature,
          count(*) as requests,
          round(coalesce(sum(l.cost_usd), 0), 4) as cost_usd
        from public.ai_logs l
        where l.user_id = p_user_id
          and l.status = 'success'
          and l.created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
        group by 1
      ) f
    ),
    'recent', (
      select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) from (
        select l.created_at, l.feature, l.status, l.model, l.total_tokens,
               round(l.cost_usd, 6) as cost_usd, l.error_message
        from public.ai_logs l
        where l.user_id = p_user_id
        order by l.created_at desc
        limit 30
      ) r
    )
  );
$$;
revoke all on function public.admin_get_user_usage(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_user_usage(uuid) to service_role;

-- ── Admin: Steuerung ───────────────────────────────────────────────────────

-- Setzt alle Limit-Overrides eines Users auf einmal (NULL = Tarif-Standard).
create or replace function public.admin_set_user_limits(
  p_user_id uuid,
  p_daily_request_limit integer,
  p_monthly_request_limit integer,
  p_monthly_cost_cap_usd numeric,
  p_unlimited boolean,
  p_note text,
  p_admin_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.user_limits as ul (
    user_id, daily_request_limit, monthly_request_limit, monthly_cost_cap_usd,
    unlimited, note, updated_at, updated_by
  )
  values (
    p_user_id, p_daily_request_limit, p_monthly_request_limit, p_monthly_cost_cap_usd,
    coalesce(p_unlimited, false), nullif(trim(p_note), ''), now(), p_admin_id
  )
  on conflict (user_id) do update set
    daily_request_limit   = excluded.daily_request_limit,
    monthly_request_limit = excluded.monthly_request_limit,
    monthly_cost_cap_usd  = excluded.monthly_cost_cap_usd,
    unlimited             = excluded.unlimited,
    note                  = excluded.note,
    updated_at            = now(),
    updated_by            = p_admin_id;
$$;
revoke all on function public.admin_set_user_limits(uuid, integer, integer, numeric, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_user_limits(uuid, integer, integer, numeric, boolean, text, uuid) to service_role;

create or replace function public.admin_set_ai_blocked(
  p_user_id uuid,
  p_blocked boolean,
  p_reason text,
  p_admin_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.user_limits as ul (user_id, ai_blocked, blocked_reason, updated_at, updated_by)
  values (p_user_id, p_blocked, case when p_blocked then nullif(trim(p_reason), '') end, now(), p_admin_id)
  on conflict (user_id) do update set
    ai_blocked     = excluded.ai_blocked,
    blocked_reason = excluded.blocked_reason,
    updated_at     = now(),
    updated_by     = p_admin_id;
$$;
revoke all on function public.admin_set_ai_blocked(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_ai_blocked(uuid, boolean, text, uuid) to service_role;

-- Tages- und Monatszähler starten ab jetzt neu (ai_logs bleibt unverändert).
create or replace function public.admin_reset_user_usage(p_user_id uuid, p_admin_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.user_limits as ul (user_id, usage_reset_at, updated_at, updated_by)
  values (p_user_id, now(), now(), p_admin_id)
  on conflict (user_id) do update set
    usage_reset_at = now(),
    updated_at     = now(),
    updated_by     = p_admin_id;
$$;
revoke all on function public.admin_reset_user_usage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_reset_user_usage(uuid, uuid) to service_role;

create or replace function public.admin_get_limit_defaults()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.tier), '[]'::jsonb) from public.ai_limit_defaults d;
$$;
revoke all on function public.admin_get_limit_defaults() from public, anon, authenticated;
grant execute on function public.admin_get_limit_defaults() to service_role;

create or replace function public.admin_set_limit_defaults(
  p_tier text,
  p_daily_request_limit integer,
  p_monthly_request_limit integer,
  p_monthly_cost_cap_usd numeric
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ai_limit_defaults (tier, daily_request_limit, monthly_request_limit, monthly_cost_cap_usd, updated_at)
  values (p_tier, p_daily_request_limit, p_monthly_request_limit, p_monthly_cost_cap_usd, now())
  on conflict (tier) do update set
    daily_request_limit   = excluded.daily_request_limit,
    monthly_request_limit = excluded.monthly_request_limit,
    monthly_cost_cap_usd  = excluded.monthly_cost_cap_usd,
    updated_at            = now();
$$;
revoke all on function public.admin_set_limit_defaults(text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.admin_set_limit_defaults(text, integer, integer, numeric) to service_role;

-- ── Admin: Protokoll ───────────────────────────────────────────────────────

create or replace function public.admin_log_action(
  p_admin_id uuid,
  p_admin_email text,
  p_action text,
  p_target_user_id uuid,
  p_details jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_audit_log (admin_id, admin_email, action, target_user_id, details)
  values (p_admin_id, p_admin_email, p_action, p_target_user_id, p_details);
$$;
revoke all on function public.admin_log_action(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_log_action(uuid, text, text, uuid, jsonb) to service_role;

create or replace function public.admin_list_audit(p_limit integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) from (
    select a.id, a.created_at, a.admin_email, a.action, a.target_user_id,
           u.email as target_email, a.details
    from public.admin_audit_log a
    left join auth.users u on u.id = a.target_user_id
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  ) t;
$$;
revoke all on function public.admin_list_audit(integer) from public, anon, authenticated;
grant execute on function public.admin_list_audit(integer) to service_role;
