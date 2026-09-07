# Google- & Apple-Login einrichten

Der Code ist fertig (`lib/socialAuth.ts`, `components/SocialAuthButtons.tsx`, eingebunden
in `app/(auth)/login.tsx` + `register.tsx`). Es fehlen nur noch die externen
Zugangsdaten.

- **Google:** Supabase-OAuth-Browserflow (`signInWithOAuth` + PKCE +
  `WebBrowser.openAuthSessionAsync` + `exchangeCodeForSession`). Kein natives SDK,
  keine Client-IDs in der App – alles im Supabase-Dashboard.
- **Apple:** nativ über `expo-apple-authentication` + `signInWithIdToken` (nur iOS).

Projekt-Ref: `assmvtdzjegddyqqaacx` → Callback-Basis
`https://assmvtdzjegddyqqaacx.supabase.co/auth/v1/callback`.
App-Deep-Link: `avorasport://auth-callback`.

---

## 1. Google Cloud Console → APIs & Dienste → Anmeldedaten

**Genau ein** OAuth-2.0-Client vom Typ **Web**:

- **Autorisierte Weiterleitungs-URIs:**
  `https://assmvtdzjegddyqqaacx.supabase.co/auth/v1/callback`
- Client-ID + Client-Secret notieren → kommen ins Supabase-Dashboard (Schritt 2).

Kein Android-/iOS-Client, kein SHA-1, kein `google-services.json`, keine `.env`-Werte.
Den OAuth-Consent-Screen (App-Name, Support-Mail, Scopes `email`, `profile`, `openid`)
einmalig ausfüllen und ggf. veröffentlichen.

---

## 2. Supabase-Dashboard

**Authentication → Providers → Google**
1. Provider **Google** aktivieren.
2. **Client ID** + **Client Secret** = die Werte aus Schritt 1.
3. „Skip nonce check" aus lassen.

**Authentication → URL Configuration → Redirect URLs**
- `avorasport://auth-callback` hinzufügen (die App springt nach der Anmeldung hierher zurück).
- Für Tests im Expo-Dev-Server ggf. zusätzlich die von `expo start` angezeigte
  `exp://…/--/auth-callback`-URL.

**Authentication → Providers → Apple**
1. Provider **Apple** aktivieren.
2. **Client IDs** = *Services ID* (Schritt 3, z. B. `com.avorasport.app.signin`)
   **und** die App-Bundle-ID `com.avorasport.app` (kommagetrennt).
3. **Secret Key** = das aus Team-ID / Key-ID / `.p8` generierte JWT
   (Supabase-Doku „Generate a Sign in with Apple client secret", gültig max. 6 Monate).

---

## 3. Apple Developer  (nur für iOS-Builds relevant)

1. **Certificates, IDs & Profiles → Identifiers**
   - Bei der App-ID `com.avorasport.app` die Capability **Sign In with Apple** aktivieren.
   - Neue **Services ID** anlegen (z. B. `com.avorasport.app.signin`), „Sign In with Apple"
     konfigurieren, Return-URL
     `https://assmvtdzjegddyqqaacx.supabase.co/auth/v1/callback`.
2. **Keys** → neuer Key mit „Sign In with Apple" → `.p8` herunterladen, **Key ID** notieren.
3. **Team ID** (oben rechts im Developer-Portal).
4. Aus Team ID + Key ID + `.p8` das Client-Secret-JWT erzeugen (Supabase-Doku) → ins
   Supabase-Dashboard (Apple-Provider → Secret Key).

`app.json` hat bereits `ios.usesAppleSignIn: true` und das Plugin
`expo-apple-authentication`. Apple-Login erscheint nur auf iOS-Geräten.

---

## 4. Build

Der Google-Wechsel entfernt ein natives Modul (`@react-native-google-signin`),
daher ist ein neuer Build nötig:
```
eas build --profile development --platform android   # bzw. ios
```
Ein reiner JS-Reload reicht nicht. Danach:

## Test-Checkliste
- [ ] „Mit Google fortfahren" → System-Browser/Custom-Tab mit Google-Kontoauswahl
      → zurück in die App → neuer Nutzer im Onboarding, bestehender in den Tabs.
- [ ] Browser abbrechen (zurück/schließen) → keine Fehlermeldung, Button wieder aktiv.
- [ ] iOS: Apple-Button sichtbar, Face/Touch-ID-Dialog, danach Onboarding.
- [ ] `supabase.auth.getUser()` nach App-Neustart → Session bleibt (AsyncStorage).
