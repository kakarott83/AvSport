-- Wasser-Erinnerungen: nutzerkonfigurierbares Zeitfenster + Intervall.
-- Die konkreten Uhrzeiten werden daraus in lib/waterReminders.ts berechnet
-- und in services/notifications/waterReminderService.ts als tägliche
-- Notifications geplant. water_goal_ml (manueller Override) kommt aus
-- 20260829010000_water_intakes.sql.

alter table public.profiles
  add column if not exists water_reminder_enabled        boolean  not null default false,
  add column if not exists water_reminder_start_hour     smallint not null default 8,
  add column if not exists water_reminder_end_hour       smallint not null default 20,
  add column if not exists water_reminder_interval_hours smallint not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_water_reminder_hours_chk'
  ) then
    alter table public.profiles
      add constraint profiles_water_reminder_hours_chk
      check (
        water_reminder_start_hour between 0 and 23
        and water_reminder_end_hour between 0 and 23
        and water_reminder_interval_hours between 1 and 12
      ) not valid;
  end if;
end $$;
