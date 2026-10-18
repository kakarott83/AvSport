-- Tägliche Erinnerung, die Mahlzeiten des Tages zu erfassen
-- (Profil → Mahlzeiten-Erinnerung, services/notifications/mealReminderService.ts).

alter table public.profiles
  add column if not exists meal_reminder_enabled boolean not null default false,
  add column if not exists meal_reminder_hour smallint not null default 20,
  add column if not exists meal_reminder_minute smallint not null default 0;

alter table public.profiles drop constraint if exists profiles_meal_reminder_hour_check;
alter table public.profiles
  add constraint profiles_meal_reminder_hour_check check (meal_reminder_hour between 0 and 23);

alter table public.profiles drop constraint if exists profiles_meal_reminder_minute_check;
alter table public.profiles
  add constraint profiles_meal_reminder_minute_check check (meal_reminder_minute between 0 and 59);
