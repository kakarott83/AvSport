# Go-Live-Checkliste AvoraSport

Stand: 18.10.2026. Alles, was vor dem öffentlichen Store-Release eingeschaltet,
umgestellt oder geprüft werden muss. 🔴 = blockiert den Release, 🟡 = sollte vorher
erledigt sein, ⚪ = empfohlen.

## 1. App-Code umstellen

- [ ] 🔴 **Feedback-Button ausschalten** – `lib/feedback.ts` → `FEEDBACK_BUTTON_ENABLED = false`
  („Profil → Feedback geben“ bleibt erhalten).
- [ ] 🔴 **Debug-Button im Login entfernen** – „Session prüfen“ (`debugSession` in
  `app/(auth)/login.tsx`) ist nur für die Entwicklung gedacht.
- [ ] 🟡 **E-Mail-Bestätigung ausliefern** – Branch `feat/email-confirmation` (Code-Eingabe
  nach der Registrierung) committen, nach `main` bringen, Builds verteilen. Erst danach
  „Confirm email“ in Supabase einschalten (siehe 2.).
- [ ] 🟡 **Android-Berechtigungen ausmisten** – `app.json` → `android.permissions` enthält
  `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` und `RECORD_AUDIO`, die die App nicht
  nutzt. Google Play fragt nach jeder Berechtigung; unnötige führen zu Rückfragen.

## 2. Supabase (Projekt `assmvtdzjegddyqqaacx`)

- [x] Custom SMTP über Strato (`smtp.strato.de:465`) – eingerichtet 18.10.2026.
- [x] Vorlage „Reset Password“ mit `{{ .Token }}`.
- [ ] 🔴 **Vorlage „Confirm signup“ mit `{{ .Token }}`** – Authentication → Email Templates.
- [ ] 🔴 **„Confirm email“ einschalten** – Authentication → Providers → Email.
  Erst, wenn die App mit Code-Eingabe bei allen Testern ist (1.).
- [ ] 🔴 **Site URL korrigieren** – steht auf `http://localhost:3000`
  (Authentication → URL Configuration). Auf die Website bzw. eine eigene Seite setzen.
- [ ] 🔴 **Redirect URLs prüfen** – `avorasport://auth-callback` muss erlaubt sein
  (Google-Login).
- [ ] 🟡 **Schutz vor geleakten Passwörtern** einschalten – „Leaked password protection“
  in den Auth-Passwort-Einstellungen (Supabase-Advisor meldet ihn als aus; Anleitung:
  https://supabase.com/docs/guides/auth/password-security).
- [ ] 🟡 **Tarif prüfen** – Projekte im Free-Tarif werden nach einer Woche ohne Aktivität
  pausiert und haben keine täglichen Backups. Für den Live-Betrieb Pro-Tarif.
- [ ] 🟡 **Testkonten und Testdaten löschen** – z. B. `av@test.de`, `av3@test.de` und deren
  Einträge.
- [ ] ⚪ Rate-Limits unter Authentication → Rate Limits prüfen (Mail-Limit jetzt 30/Std.).

## 3. Edge Functions & Secrets

- [x] `ai-proxy` eingespielt (18.10.2026) – vorher fehlte sie, alle KI-Anfragen
  scheiterten mit 404.
- [ ] 🔴 **Secret `GEMINI_API_KEY` für `ai-proxy` setzen** – ohne ihn antwortet jede
  KI-Anfrage mit „GEMINI_API_KEY ist nicht gesetzt“ (500).
- [ ] 🟡 **KI-Limits prüfen** – Standardwerte in `ai_limit_defaults` (Free/Premium,
  Tag/Monat/Kosten-Deckel), einstellbar im Admin-Panel.

- [ ] 🔴 **Feedback-Mail testen** – `SMTP_USER` / `SMTP_PASS` sind gesetzt; einmal Feedback
  senden und prüfen, dass die Mail bei `support@milan-muc.de` ankommt
  (`feedback.emailed = true`).
- [ ] 🔴 **RevenueCat-Webhook** – Secret `REVENUECAT_WEBHOOK_AUTH` gesetzt und in RevenueCat
  derselbe Authorization-Header eingetragen; Testkauf muss `profiles.is_premium` setzen.

## 4. Build-Konfiguration

- [ ] 🔴 **EAS-Umgebung `production` befüllen** – sie ist aktuell **leer**. Ein Android-
  Store-Build hätte keine Supabase-URL, keinen Anon-Key und keinen Gemini-Key.
  Wie bei `preview` als Secret anlegen: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`,
  `EXPO_PUBLIC_USDA_API_KEY`. (`EXPO_PUBLIC_GEMINI_API_KEY` wird nicht mehr gebraucht
  und kann aus `.env` und EAS entfernt werden.)
- [ ] 🔴 **RevenueCat-Produktiv-Keys** – iOS `appl_…`, Android `goog_…`. Keine `test_`-Keys
  (die schalten Abos ab; der iOS-Workflow warnt davor). iOS: GitHub-Secrets,
  Android: EAS `production`.
- [ ] 🟡 **USDA-API-Key** – derzeit läuft die Lebensmitteldatenbank mit dem stark
  begrenzten `DEMO_KEY`. Kostenloser Key: https://api.data.gov/signup →
  `EXPO_PUBLIC_USDA_API_KEY` (GitHub-Secret für iOS + EAS für Android).
- [ ] ⚪ **Gemini-Budget-Alarm** in Google Cloud setzen. (Der Key steckt nicht mehr im
  App-Bundle – alle KI-Aufrufe laufen über die Edge Function `ai-proxy`.)
- [ ] 🟡 **Android als AAB bauen** – Profil `production` (nicht `preview`, das erzeugt eine
  APK). `android.versionCode` aus `app.json` entfernen (wird wegen
  `appVersionSource: remote` ignoriert).

## 5. Rechtliches

- [ ] 🔴 **Datenschutzerklärung erstellen** – es gibt bisher keine. Pflicht für beide
  Stores, besonders wegen Gesundheits- und Zyklusdaten (Art. 9 DSGVO). Als öffentliche
  URL (für die Store-Einträge) und in der App unter „Rechtliches“ verlinken; der Link
  „Datenschutz“ in der Paywall führt derzeit nur auf „Rechtliches“.
- [ ] 🔴 **Impressum ausfüllen** – Platzhalter `[Name des Anbieters]`,
  `[kontakt@example.com]` usw. in `lib/i18n/translations/legal.ts` (DE + EN).
- [ ] 🟡 **AGB-Abschnitt anwaltlich prüfen lassen** (errechnete Werte, Gewähr, Haftung).
- [ ] 🟡 **Einwilligung für Gesundheitsdaten** – Zyklus- und Health-Daten sind besondere
  Kategorien nach DSGVO; ob eine ausdrückliche Einwilligung in der App nötig ist, mit
  der Datenschutzerklärung klären.

## 6. Apple App Store

- [ ] 🔴 **App-Datenschutz-Angaben** (App Store Connect → App Privacy): Gesundheit,
  Fitness, Kontaktdaten (E-Mail), Kaufhistorie, Nutzungsdaten.
- [ ] 🔴 **HealthKit-Angaben** – Store-Beschreibung muss erwähnen, dass Apple Health
  genutzt wird; Datenschutzerklärungs-URL ist Pflicht.
- [ ] 🔴 **In-App-Abos** (Monat/Jahr) in App Store Connect angelegt, Preise gesetzt,
  zur Prüfung mit der App eingereicht; Abo-Gruppe in RevenueCat verknüpft.
- [ ] 🟡 **Periodendaten aus Apple Health auf echtem Gerät testen** (nativer Patch für
  `react-native-health`, bisher nur kompiliert).
- [ ] 🟡 Sign in with Apple auf einem echten Gerät testen.
- [ ] ⚪ Screenshots, Beschreibung (DE + EN), Altersfreigabe, Support-URL, Demo-Konto für
  die Review.

## 7. Google Play

- [ ] 🔴 **Health-Connect-Erklärung** (Play Console → App-Inhalte → Gesundheits-Apps /
  Health-Connect-Berechtigungen) für `READ_STEPS`, `READ_ACTIVE_CALORIES_BURNED`,
  `READ_MENSTRUATION` – mit Begründung je Datentyp.
- [ ] 🔴 **Datensicherheit-Formular** (Data safety) ausfüllen.
- [ ] 🔴 **Abos** in der Play Console angelegt und in RevenueCat verknüpft.
- [ ] 🔴 **Google-Login** – Google-Cloud-OAuth-Client (Web) mit Redirect
  `https://assmvtdzjegddyqqaacx.supabase.co/auth/v1/callback`, Provider in Supabase
  aktiv; siehe `docs/social-auth-setup.md`.
- [ ] 🟡 Health-Connect-Import der Periode auf einem echten Gerät testen.

## 8. Abschließender Test (auf echten Geräten, Store-Build)

- [ ] Registrierung → Bestätigungscode → Onboarding
- [ ] Passwort vergessen → Code → neues Passwort
- [ ] Google- und Apple-Login
- [ ] Foto-Scanner, Beschreibung, „Tag erfassen“
- [ ] Kalender mit Periode, Prognose, fruchtbaren Tagen; Health-Import
- [ ] KI-Limit erreichen → Paywall → Testkauf → Premium aktiv → Wiederherstellen
- [ ] Erinnerungen (Wasser, Zyklus) kommen an
- [ ] Sprache Deutsch/Englisch umschalten
