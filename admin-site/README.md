# AvoraSport Admin-Panel

Statische Website (HTML/CSS/JS, kein Build-Schritt, keine Server-Anforderungen)
zur Verwaltung der AvoraSport-App: Nutzer-Metriken, Feedback bearbeiten,
Premium manuell vergeben/entziehen.

## Wie es funktioniert

- **Login:** mit deinem bestehenden AvoraSport-Account (Supabase Auth,
  E-Mail + Passwort). Ein Login allein reicht nicht — nur Accounts, die in der
  Tabelle `public.admins` stehen, bekommen Daten zurück.
- **Daten:** kommen ausschließlich über die Edge Function
  `supabase/functions/admin-api`. Diese Website kennt nur den öffentlichen
  `anon`-Key (zum Einloggen) — der `service_role`-Key, der vollen DB-Zugriff
  hätte, verlässt nie den Supabase-Server.
- **Tabs:** Dashboard (Engagement/Retention, Feature-Nutzung, Premium/Kosten,
  KI-Fehler — siehe `analytics.*`-Views), Feedback (erledigt markieren),
  User (Übersicht + Premium manuell setzen).

## Deployment auf Strato

Läuft auf jedem Strato-Webhosting-Paket, das statische Dateien ausliefert
(auch das einfachste) — kein PHP, kein Node.js, keine Datenbank nötig.

1. Bei Strato einloggen → **Webspace** → **Dateimanager** (oder FTP-Zugang
   nutzen, z. B. mit FileZilla).
2. Alle Dateien aus diesem Ordner (`index.html`, `style.css`, `app.js`,
   `config.js`) in ein Verzeichnis hochladen, z. B. `/admin/` (dann erreichbar
   unter `https://deine-domain.de/admin/`) oder direkt ins Wurzelverzeichnis
   für eine eigene (Sub-)Domain.
3. Fertig — kein Build, kein Deploy-Skript. Die Seite spricht direkt mit
   Supabase.

**Empfehlung:** Nutze eine eigene Subdomain (z. B. `admin.deine-domain.de`)
statt eines Unterordners der öffentlichen App-Website, und richte per
Strato-Passwortschutz (falls verfügbar) oder zumindest über einen
nicht-erratbaren Pfadnamen eine zusätzliche Hürde ein — der eigentliche
Zugriffsschutz sitzt zwar serverseitig (admin-api + `admins`-Tabelle), aber
"security in depth" schadet nicht.

## Neuen Admin hinzufügen

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'neue-admin-email@example.com';
```

(im Supabase SQL Editor, oder frag Claude — der hat per MCP Zugriff.)

## Config ändern

`config.js` enthält Supabase-URL, den öffentlichen anon-Key und die
admin-api-URL. Ändert sich das Supabase-Projekt, hier anpassen — sonst nichts
zu konfigurieren.
