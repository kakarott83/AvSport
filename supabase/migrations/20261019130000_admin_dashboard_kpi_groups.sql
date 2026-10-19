-- Admin-Dashboard: KPI-Übersicht in vier Bereichen (Wachstum & Bindung,
-- Nutzung der Funktionen, Monetarisierung & Kosten, Qualität & Betrieb).
-- Eigene Funktion, damit admin_get_dashboard() schlank bleibt; die admin-api
-- hängt das Ergebnis als "kpi_groups" an die metrics-Antwort.

create or replace function public.admin_get_kpi_groups()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'analytics', 'pg_temp'
as $function$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_users   bigint;
  v_mau     bigint;
  v_avg_dau numeric;
  v_cost_month numeric;
  v_picto_month bigint;
begin
  select count(*) into v_users from auth.users;

  select count(distinct user_id) into v_mau from (
    select user_id from public.food_logs     where created_at >= now() - interval '30 days'
    union all select user_id from public.exercise_logs where created_at >= now() - interval '30 days'
    union all select user_id from public.ai_logs      where created_at >= now() - interval '30 days'
  ) a where user_id is not null;

  select coalesce(avg(active_users), 0) into v_avg_dau
  from analytics.daily_active_users where activity_date >= (current_date - 30);

  select coalesce(sum(cost_usd), 0) into v_cost_month from public.ai_logs where created_at >= v_month_start;
  select count(*) into v_picto_month from public.exercise_pictograms where created_at >= v_month_start;

  return jsonb_build_object(
    'growth', jsonb_build_object(
      'users_total',     v_users,
      'onboarded',       (select count(*) from public.profiles where display_name is not null and display_name <> ''),
      'mau',             v_mau,
      'avg_dau_30d',     round(v_avg_dau, 1),
      'stickiness_pct',  case when v_mau > 0 then round(v_avg_dau / v_mau * 100, 1) else 0 end,
      -- Neue Nutzer, die 8–60 Tage dabei sind: wie viele waren in den letzten 7 Tagen aktiv?
      'retention_cohort', (select count(*) from analytics.user_activity_summary where days_since_signup between 8 and 60),
      'retention_active', (select count(*) from analytics.user_activity_summary where days_since_signup between 8 and 60 and active_last_7d),
      'inactive_30d',    (select count(*) from analytics.user_activity_summary
                          where last_activity_at is null or last_activity_at < now() - interval '30 days')
    ),
    'features', jsonb_build_object(
      'users_total',      v_users,
      'nutrition_30d',    (select count(distinct user_id) from public.food_logs     where created_at >= now() - interval '30 days'),
      'training_30d',     (select count(distinct user_id) from public.exercise_logs where created_at >= now() - interval '30 days'),
      'water_30d',        (select count(distinct user_id) from public.water_intakes where created_at >= now() - interval '30 days'),
      'cycle_30d',        (select count(distinct user_id) from public.cycle_events  where created_at >= now() - interval '30 days'),
      'ai_plans_30d',     (select count(*) from public.workout_plans where is_ai_generated and created_at >= now() - interval '30 days'),
      'plans_30d',        (select count(*) from public.workout_plans where created_at >= now() - interval '30 days'),
      'food_photo_30d',   (select count(*) from public.ai_logs where feature = 'food_photo' and status = 'success' and created_at >= now() - interval '30 days'),
      'food_text_30d',    (select count(*) from public.ai_logs where feature = 'food_text'  and status = 'success' and created_at >= now() - interval '30 days'),
      'health_sync_on',   (select count(*) from public.profiles where sync_health),
      'cycle_tracking_on',(select count(*) from public.profiles where cycle_tracking_enabled and gender = 'female'),
      'meal_reminder_on', (select count(*) from public.profiles where meal_reminder_enabled),
      'water_reminder_on',(select count(*) from public.profiles where water_reminder_enabled)
    ),
    'money', jsonb_build_object(
      'premium_total',    (select count(*) from public.profiles where is_premium),
      'premium_yearly',   (select count(*) from public.profiles where is_premium and premium_product ~* '(year|annual|jahr|12)'),
      'premium_monthly',  (select count(*) from public.profiles where is_premium and not coalesce(premium_product ~* '(year|annual|jahr|12)', false)),
      'cost_month_usd',   round(v_cost_month + v_picto_month * 0.039, 4),
      'cost_per_mau_usd', case when v_mau > 0 then round((v_cost_month + v_picto_month * 0.039) / v_mau, 4) else 0 end,
      'cost_by_feature_month', (
        select coalesce(jsonb_agg(t order by t.cost_usd desc), '[]'::jsonb) from (
          select coalesce(feature, 'unbekannt') as feature, count(*) as requests, round(sum(cost_usd)::numeric, 4) as cost_usd
          from public.ai_logs where created_at >= v_month_start
          group by 1
        ) t
      ),
      'pictograms_month', v_picto_month
    ),
    'quality', jsonb_build_object(
      'ai_success_7d',    (select count(*) from public.ai_logs where status = 'success' and created_at >= now() - interval '7 days'),
      'ai_errors_7d',     (select count(*) from public.ai_logs where status = 'error'   and created_at >= now() - interval '7 days'),
      'lookup_usda_30d',  (select count(*) from public.nutrition_cost_logs where call_type in ('usda', 'usda_fallback') and created_at >= now() - interval '30 days'),
      'lookup_llm_30d',   (select count(*) from public.nutrition_cost_logs where call_type = 'llm_fallback'           and created_at >= now() - interval '30 days'),
      'lookup_cache_30d', (select count(*) from public.nutrition_cost_logs where call_type = 'cache_hit'              and created_at >= now() - interval '30 days'),
      'feedback_open',    (select count(*) from public.feedback where not coalesce(handled, false)),
      'feedback_done',    (select count(*) from public.feedback where coalesce(handled, false)),
      'feedback_30d',     (select count(*) from public.feedback where created_at >= now() - interval '30 days')
    )
  );
end;
$function$;

revoke all on function public.admin_get_kpi_groups() from public, anon, authenticated;
grant execute on function public.admin_get_kpi_groups() to service_role;
