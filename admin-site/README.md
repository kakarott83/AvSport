# AvoraSport Admin-Panel

Statische Website (HTML/CSS/JS, kein Build-Schritt, kein PHP/Node) zur
Steuerung der AvoraSport-App, gehostet auf **milan-muc.de**.

## Was das Panel kann

- **Nutzer & Limits:** jede:r Nutzer:in mit KI-Verbrauch heute / diesen Monat /
  Kosten im Monat gegen das jeweilige Limit, Fehler der letzten 7 Tage,
  zuletzt aktiv. Suche, Filter (am Limit, gesperrt, Premium, eigene Limits …)
  und Sortierung.
- **Pro Nutzer (Klick auf die Zeile):** Verlauf der letzten 30 Tage, Nutzung
  nach Funktion (Foto-Scanner, Trainingsplan …), letzte Anfragen samt Fehlern,
  und Steuerung:
  - eigene Limits: Anfragen pro Tag, Anfragen pro Monat, Kostenlimit pro Monat
    (leer = Standard), „unbegrenzt“, interne Notiz
  - Zähler zurücksetzen (Tag/Monat/Kosten starten neu, Verlauf bleibt)
  - KI-Funktionen sperren/entsperren (mit Grund)
  - Account komplett sperren/entsperren (kein Login mehr)
  - Premium manuell geben/entziehen
- **Standard-Limits** für Free und Premium (gelten für alle ohne eigene Limits).
- **Protokoll:** wer hat wann was bei wem geändert.
- **Dashboard** und **Feedback** wie bisher.

## Wie die Limits durchgesetzt werden

Die App ruft Gemini nicht mehr direkt auf, sondern über die Edge Function
`supabase/functions/ai-proxy`. Dort liegt der Gemini-Key; vor jeder Anfrage
prüft sie `public.ai_quota_status()` (Migration
`20261017130000_ai_usage_limits.sql`) und lehnt ab, wenn ein Limit erreicht
oder der Nutzer gesperrt ist. Gezählt werden erfolgreiche Anfragen, Tag und
Monat nach deutscher Zeit (Europe/Berlin). Standard wie bisher: Free 10
Anfragen/Tag, Premium 10 $/Monat Kostenlimit, `av@test.de` unbegrenzt.

## Sicherheit

- Login mit dem AvoraSport-Account **plus Zwei-Faktor (TOTP)**. Beim ersten
  Login wird die Authenticator-App per QR-Code eingerichtet.
- Nur Accounts in `public.admins` bekommen Daten. Die Website kennt nur den
  öffentlichen anon-Key; service_role- und Gemini-Key bleiben auf dem Server.
- Die admin-api akzeptiert Browser-Requests nur von den Adressen in
  `ADMIN_ALLOWED_ORIGINS` (CORS).
- Sitzung nur im Tab (sessionStorage), automatisches Abmelden nach 30 Minuten
  Inaktivität (`idleLogoutMinutes` in `config.js`).
- `.htaccess` setzt Sicherheits-Header (CSP, kein Einbetten, HTTPS-Zwang,
  kein Caching, keine Suchmaschinen-Indexierung).

## Inbetriebnahme (Reihenfolge einhalten)

1. **Datenbank-Migration einspielen**
   `supabase db push` – oder den Inhalt von
   `supabase/migrations/20261017130000_ai_usage_limits.sql` im Supabase SQL
   Editor ausführen.
2. **Secrets setzen**
   ```bash
   supabase secrets set GEMINI_API_KEY=<dein-gemini-key>
   supabase secrets set ADMIN_ALLOWED_ORIGINS=https://admin.milan-muc.de,https://milan-muc.de,https://www.milan-muc.de
   ```
   (Die Origins oben sind auch der Standard, falls das Secret fehlt. Für lokale
   Tests z. B. `,http://localhost:8080` anhängen.)
3. **Functions deployen**
   ```bash
   supabase functions deploy ai-proxy
   supabase functions deploy admin-api
   ```
4. **2FA in Supabase prüfen:** Dashboard → Authentication → Multi-Factor →
   TOTP muss aktiviert sein (Standard). Notfalls lässt sich die 2FA-Pflicht mit
   `supabase secrets set ADMIN_REQUIRE_MFA=false` abschalten.
5. **Website hochladen (Strato):** alle Dateien aus diesem Ordner inklusive
   `.htaccess`, `robots.txt` und `vendor/` hochladen. Empfohlen ist eine eigene
   Subdomain `admin.milan-muc.de` (Strato → Domains → Subdomain anlegen → auf
   das Upload-Verzeichnis zeigen, SSL-Zertifikat aktivieren). Ein Unterordner
   wie `milan-muc.de/admin/` funktioniert ebenfalls. Andere Adresse →
   in `ADMIN_ALLOWED_ORIGINS` eintragen.
6. **Neue App-Version veröffentlichen.** Erst ab dieser Version laufen alle
   KI-Aufrufe über den Proxy.
7. **Danach den alten Gemini-Key ersetzen:** neuen Key in Google AI Studio
   erzeugen, nur als Supabase-Secret `GEMINI_API_KEY` setzen, den alten Key
   löschen und `EXPO_PUBLIC_GEMINI_API_KEY` aus `.env` und den GitHub-Secrets
   entfernen. Der alte Key steckt in bisherigen App-Builds und erlaubt sonst
   weiterhin Anfragen an den Limits vorbei. Alte App-Versionen verlieren damit
   die KI-Funktionen.

## Neuen Admin hinzufügen

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'neue-admin-email@example.com';
```

## Config ändern

`config.js` enthält Supabase-URL, den öffentlichen anon-Key, die
admin-api-URL und die Inaktivitäts-Abmeldung. Ändert sich das
Supabase-Projekt, hier und in der CSP in `.htaccess` (connect-src) anpassen.
