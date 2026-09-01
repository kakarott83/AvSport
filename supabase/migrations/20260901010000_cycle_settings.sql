-- Zusatz-Einstellungen für den Periode-Tab.
--
-- cycle_length_days / period_duration_days (aus früheren Migrationen) bleiben
-- der manuelle Fallback, solange < 2 vollständige Zyklen erfasst sind. Sie
-- werden NICHT automatisch überschrieben — die App schlägt den berechneten
-- Ø-Wert vor und übernimmt ihn erst nach Bestätigung durch die Nutzerin.

alter table public.profiles
  add column if not exists cycle_period_reminder     boolean not null default false,
  add column if not exists cycle_fertile_reminder    boolean not null default false,
  -- Merkt sich das zuletzt gemeldete Prognosedatum, damit eine Erinnerung
  -- pro Zyklus nur einmal ausgelöst wird.
  add column if not exists cycle_last_reminded_start  date;
