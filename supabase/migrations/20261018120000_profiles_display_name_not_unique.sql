-- display_name ist ein frei gewählter Anzeigename (z. B. "Micha") und muss
-- nicht eindeutig sein. Die Einschränkung stammt noch aus der Zeit, als die
-- Spalte "username" hieß; sie ließ das Onboarding neuer Konten mit einem
-- bereits vergebenen Vornamen scheitern (Endlosschleife im Onboarding).

alter table public.profiles drop constraint if exists profiles_username_key;
