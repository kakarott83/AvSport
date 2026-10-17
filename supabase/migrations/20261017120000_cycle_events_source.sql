-- Herkunft eines Blutungstags: manuell in der App erfasst oder aus
-- Apple Health / Health Connect übernommen (services/cycleHealthSync.ts).
-- Import-Tage (source = 'health') dürfen beim Abgleich aktualisiert/gelöscht
-- werden; manuelle Tage nie. Bestehende Zeilen sind manuell erfasst.

alter table public.cycle_events
  add column if not exists source text not null default 'manual';

alter table public.cycle_events
  drop constraint if exists cycle_events_source_check;

alter table public.cycle_events
  add constraint cycle_events_source_check check (source in ('manual', 'health'));
