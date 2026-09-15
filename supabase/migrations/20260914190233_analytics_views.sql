-- Analyse-Views für Nutzerverhalten: Engagement/Retention, Feature-Nutzung,
-- Premium/Umsatz, Technik/Fehler. Baut ausschließlich auf bestehenden Tabellen
-- auf (exercise_logs, food_logs, ai_logs, workout_plans, ...) — keine neue
-- Instrumentierung im App-Code nötig.
--
-- Eigenes Schema `analytics`, bewusst NICHT über PostgREST/den anon-Key
-- erreichbar (anders als public.*) — Zugriff nur per Supabase SQL Editor
-- (läuft als postgres) oder Service-Role. Enthält teils aggregierte
-- Nutzerdaten, die nicht für den Client bestimmt sind.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;
grant usage on schema analytics to postgres, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Engagement & Retention
-- ═══════════════════════════════════════════════════════════════════════════

-- Aktive User pro Tag (mind. eine Aktion in irgendeiner Kern-Tabelle).
create or replace view analytics.daily_active_users as
with activity as (
  select user_id, created_at::date as activity_date from public.exercise_logs where user_id is not null
  union all
  select user_id, created_at::date from public.food_logs
  union all
  select user_id, created_at::date from public.food_scans where user_id is not null
  union all
  select user_id, created_at::date from public.water_intakes
  union all
  select user_id, measured_at::date from public.body_measurements
  union all
  select user_id, date from public.daily_logs
  union all
  select user_id, date from public.cycle_events
)
select activity_date, count(distinct user_id) as active_users
from activity
group by activity_date
order by activity_date desc;

-- Eine Zeile pro User: Signup, erste/letzte Aktivität, Aktivitätstage —
-- Basis für Retention/Churn-Auswertungen.
create or replace view analytics.user_activity_summary as
with activity as (
  select user_id, created_at as ts from public.exercise_logs where user_id is not null
  union all select user_id, created_at from public.food_logs
  union all select user_id, created_at from public.food_scans where user_id is not null
  union all select user_id, created_at from public.water_intakes
  union all select user_id, measured_at from public.body_measurements
  union all select user_id, created_at from public.daily_logs
  union all select user_id, created_at from public.cycle_events
),
agg as (
  select
    user_id,
    min(ts) as first_activity_at,
    max(ts) as last_activity_at,
    count(*) as total_events,
    count(distinct ts::date) as active_days
  from activity
  group by user_id
)
select
  u.id as user_id,
  u.email,
  u.created_at as signed_up_at,
  coalesce(p.is_premium, false) as is_premium,
  a.first_activity_at,
  a.last_activity_at,
  coalesce(a.total_events, 0) as total_events,
  coalesce(a.active_days, 0) as active_days,
  a.last_activity_at is not null and now() - a.last_activity_at < interval '7 days' as active_last_7d,
  a.last_activity_at is not null and now() - a.last_activity_at < interval '30 days' as active_last_30d,
  extract(day from now() - u.created_at)::int as days_since_signup
from auth.users u
left join public.profiles p on p.id = u.id
left join agg a on a.user_id = u.id
order by u.created_at desc;

-- Verteilung der User nach "wann zuletzt aktiv" — schneller Blick auf Churn.
create or replace view analytics.retention_buckets as
select
  case
    when last_activity_at is null then '0: nie aktiv'
    when now() - last_activity_at < interval '1 day' then '1: heute aktiv'
    when now() - last_activity_at < interval '7 days' then '2: letzte 7 Tage'
    when now() - last_activity_at < interval '30 days' then '3: letzte 30 Tage'
    when now() - last_activity_at < interval '90 days' then '4: letzte 90 Tage'
    else '5: >90 Tage inaktiv'
  end as recency_bucket,
  count(*) as users
from analytics.user_activity_summary
group by 1
order by 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- Feature-Nutzung
-- ═══════════════════════════════════════════════════════════════════════════

-- Wie viele User (und % aller User) haben jedes Feature je genutzt.
create or replace view analytics.feature_adoption as
with totals as (
  select count(*) as total_users from auth.users
),
per_feature as (
  select 'Training geloggt' as feature, count(distinct user_id) as users from public.exercise_logs where user_id is not null
  union all select 'KI-Trainingsplan erstellt', count(distinct user_id) from public.workout_plans where is_ai_generated
  union all select 'Manueller Trainingsplan erstellt', count(distinct user_id) from public.workout_plans where not coalesce(is_ai_generated, false)
  union all select 'Mahlzeit erfasst', count(distinct user_id) from public.food_logs
  union all select 'Kalorien-Scanner (Foto)', count(distinct user_id) from public.food_scans where user_id is not null
  union all select 'Wasser getrackt', count(distinct user_id) from public.water_intakes
  union all select 'Körperwerte erfasst', count(distinct user_id) from public.body_measurements
  union all select 'Zyklus-Tracking genutzt', count(distinct user_id) from public.cycle_events
  union all select 'Feedback gegeben', count(distinct user_id) from public.feedback where user_id is not null
)
select
  f.feature,
  f.users,
  t.total_users,
  round(100.0 * f.users / nullif(t.total_users, 0), 1) as pct_of_users
from per_feature f cross join totals t
order by f.users desc;

-- Plan-Erstellung pro Woche: KI-generiert vs. manuell, Zirkel vs. Standard.
create or replace view analytics.plan_creation_stats as
select
  date_trunc('week', created_at)::date as week,
  count(*) as plans_created,
  count(*) filter (where is_ai_generated) as ai_generated,
  count(*) filter (where not coalesce(is_ai_generated, false)) as manual,
  count(*) filter (where is_circuit) as circuit_plans
from public.workout_plans
group by 1
order by 1 desc;

-- ═══════════════════════════════════════════════════════════════════════════
-- Premium / Umsatz
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view analytics.premium_overview as
select
  count(*) as total_users,
  count(*) filter (where is_premium) as premium_users,
  round(100.0 * count(*) filter (where is_premium) / nullif(count(*), 0), 1) as premium_conversion_pct
from public.profiles;

create or replace view analytics.premium_product_breakdown as
select premium_product, count(*) as users
from public.profiles
where is_premium and premium_product is not null
group by premium_product
order by users desc;

-- KI-Kosten pro User im laufenden Kalendermonat — zeigt direkt, wer nah am
-- 10€-Kosten-Deckel für Premium ist (siehe PREMIUM_MONTHLY_COST_CAP_EUR in
-- services/gemini/client.ts).
create or replace view analytics.ai_cost_by_user_this_month as
select
  l.user_id,
  coalesce(p.is_premium, false) as is_premium,
  count(*) as requests,
  round(sum(l.cost_usd)::numeric, 4) as cost_usd_this_month,
  round(100.0 * sum(l.cost_usd) / 10.0, 1) as pct_of_premium_cap
from public.ai_logs l
left join public.profiles p on p.id = l.user_id
where l.created_at >= date_trunc('month', now())
group by l.user_id, p.is_premium
order by cost_usd_this_month desc;

-- ═══════════════════════════════════════════════════════════════════════════
-- Technik / Fehler
-- ═══════════════════════════════════════════════════════════════════════════

-- Gemini-Anfragen pro Tag & Modell: Volumen, Fehlerquote, Tokens, Kosten.
create or replace view analytics.ai_daily_stats as
select
  created_at::date as day,
  model,
  count(*) as requests,
  count(*) filter (where status = 'error') as errors,
  round(100.0 * count(*) filter (where status = 'error') / nullif(count(*), 0), 1) as error_rate_pct,
  sum(prompt_tokens) as prompt_tokens,
  sum(completion_tokens) as completion_tokens,
  round(sum(cost_usd)::numeric, 4) as cost_usd
from public.ai_logs
group by 1, 2
order by 1 desc, 2;

-- Letzte 200 fehlgeschlagene Gemini-Anfragen zum Debuggen.
create or replace view analytics.ai_errors_recent as
select created_at, user_id, model, error_message
from public.ai_logs
where status = 'error'
order by created_at desc
limit 200;

-- Externe API-Calls (USDA-Lookups etc., siehe nutrition_cost_logs) pro Tag/Typ.
create or replace view analytics.external_api_calls as
select call_type, created_at::date as day, count(*) as calls
from public.nutrition_cost_logs
group by 1, 2
order by 2 desc, 1;
