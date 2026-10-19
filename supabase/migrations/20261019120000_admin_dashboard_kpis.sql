-- Admin-Dashboard: zusammengefasste Kennzahlen ("kpis") für die Startseite des
-- Admin-Panels (admin-site/app.js → loadDashboard). Ergänzt admin_get_dashboard()
-- um einen Block "kpis"; alle bisherigen Felder bleiben unverändert.
-- Tag/Monat nach deutscher Zeit (Europe/Berlin), wie in ai_quota_status().

create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'analytics', 'pg_temp'
as $function$
declare
  result jsonb;
  v_day_start   timestamptz := date_trunc('day',   now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
begin
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'users_total',      (select count(*) from auth.users),
      'users_new_7d',     (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'users_new_30d',    (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      'active_today',     (select count(distinct user_id) from (
                              select user_id from public.food_logs     where created_at >= v_day_start
                              union all select user_id from public.exercise_logs where created_at >= v_day_start
                              union all select user_id from public.ai_logs      where created_at >= v_day_start
                            ) a where user_id is not null),
      'active_7d',        (select count(distinct user_id) from (
                              select user_id from public.food_logs     where created_at >= now() - interval '7 days'
                              union all select user_id from public.exercise_logs where created_at >= now() - interval '7 days'
                              union all select user_id from public.ai_logs      where created_at >= now() - interval '7 days'
                            ) a where user_id is not null),
      'premium_users',    (select count(*) from public.profiles where is_premium),
      'ai_requests_today',(select count(*) from public.ai_logs where status = 'success' and created_at >= v_day_start),
      'ai_requests_month',(select count(*) from public.ai_logs where status = 'success' and created_at >= v_month_start),
      'ai_errors_7d',     (select count(*) from public.ai_logs where status = 'error' and created_at >= now() - interval '7 days'),
      'ai_cost_today_usd',(select round(coalesce(sum(cost_usd), 0)::numeric, 4) from public.ai_logs where created_at >= v_day_start),
      'ai_cost_month_usd',(select round(coalesce(sum(cost_usd), 0)::numeric, 4) from public.ai_logs where created_at >= v_month_start),
      'ai_cost_total_usd',(select round(coalesce(sum(cost_usd), 0)::numeric, 4) from public.ai_logs),
      -- KI-Piktogramme laufen nicht über ai_logs (sollen das Nutzerlimit nicht belasten)
      'pictograms_total', (select count(*) from public.exercise_pictograms),
      'pictograms_month', (select count(*) from public.exercise_pictograms where created_at >= v_month_start),
      'pictogram_cost_per_image_usd', 0.039,
      'meals_logged_7d',  (select count(*) from public.food_logs where created_at >= now() - interval '7 days'),
      'workouts_logged_7d', (select count(distinct workout_id) from public.exercise_logs where created_at >= now() - interval '7 days'),
      'feedback_open',    (select count(*) from public.feedback where not coalesce(handled, false))
    ),
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
$function$;

revoke all on function public.admin_get_dashboard() from public, anon, authenticated;
grant execute on function public.admin_get_dashboard() to service_role;
