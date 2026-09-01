# Google- & Apple-Login einrichten

Der Code ist fertig (`lib/socialAuth.ts`, `components/SocialAuthButtons.tsx`, eingebunden
in `app/(auth)/login.tsx` + `register.tsx`). Es fehlen nur noch die externen
Zugangsdaten. Ohne sie zeigt der Google-Button einen Hinweis statt sich anzumelden.

---

## 1. Supabase-Dashboard

**Authentication → Providers**

### Google
1. Provider **Google** aktivieren.
2. **Client ID (for OAuth)** = die *Web*-Client-ID aus Google Cloud (Schritt 2).
3. **Client Secret** = das zugehörige Web-Secret.
4. Unter **Authorized Client IDs** zusätzlich die **iOS**- und **Android**-Client-ID
   eintragen (kommagetrennt) – nötig, weil die native App mit diesen IDs Tokens holt.

### Apple
1. Provider **Apple** aktivieren.
2. **Client IDs** = die *Services ID* (Schritt 3, z. B. `com.avorasport.app.signin`)
   **und** die App-Bundle-ID `com.avorasport.app` (kommagetrennt).
3. **Secret Key** = das aus Team-ID / Key-ID / `.p8`-Datei generierte JWT
   (Supabase-Doku „Generate a Sign in with Apple client secret", gültig max. 6 Monate).

**Authentication → URL Configuration**
- Bei rein nativer Anmeldung (unser Fall) sind keine Redirect-URLs nötig.

---

## 2. Google Cloud Console  → APIs & Dienste → Anmeldedaten

„OAuth 2.0-Client-ID erstellen" – **drei** Clients:

| Typ     | Angaben |
|---------|---------|
| **Web** | Keine Redirect-URI nötig für native Nutzung; diese ID/Secret kommen ins Supabase-Dashboard **und** in `.env` als `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. |
| **Android** | Paketname `com.avorasport.app` + SHA-1-Fingerprint. Debug-SHA-1: `keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android` (Passwort `android`). Für den Release-/Play-Build den SHA-1 aus der Play Console (App-Signatur) ergänzen. |
| **iOS** | Bundle-ID `com.avorasport.app`. Diese ID kommt in `.env` als `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` **und** – als „reversed client id" – in `app.json`. |

`.env`:
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234567890-abcd....apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1234567890-efgh....apps.googleusercontent.com
```

`app.json` (Platzhalter ersetzen – „reversed" iOS client id):
```json
["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.1234567890-efgh" }]
```

> Kein `google-services.json` nötig – die Android-Anmeldung läuft über die
> Web-Client-ID (`configure({ webClientId })`).

---

## 3. Apple Developer  (nur für iOS-Builds relevant)

1. **Certificates, IDs & Profiles → Identifiers**
   - Beim App-ID `com.avorasport.app` die Capability **Sign In with Apple** aktivieren.
   - Neue **Services ID** anlegen (z. B. `com.avorasport.app.signin`), „Sign In with Apple"
     konfigurieren, Domain + Return-URL:
     `https://<PROJECT-REF>.supabase.co/auth/v1/callback`
2. **Keys** → neuer Key mit „Sign In with Apple" → `.p8` herunterladen, **Key ID** notieren.
3. **Team ID** (oben rechts im Developer-Portal).
4. Aus Team ID + Key ID + `.p8` das Client-Secret-JWT erzeugen (Supabase-Doku) → ins
   Supabase-Dashboard (Apple-Provider → Secret Key).

`app.json` hat bereits `ios.usesAppleSignIn: true` und das Plugin
`expo-apple-authentication`.

Apple-Login erscheint nur auf iOS-Geräten (Android blendet den Button aus).

---

## 4. Build

Nach dem Setzen der `.env`-Werte und `app.json`:
```
npx expo run:android     # bzw. eas build für iOS
```
Ein reiner JS-Reload reicht nicht – die Client-IDs werden zur Buildzeit eingebettet.

---

## Bekannter kosmetischer Fehler in VS Code

Die Expo-Erweiterung markiert in `app.json` die `@react-native-google-signin/google-signin`-
Zeile mit `ERR_MODULE_NOT_FOUND` (`.../lib/module/signIn/GoogleSignin`). Ursache: Das
Paket (v16) liefert nur einen ESM-Build mit teils fehlenden `.js`-Endungen; der
Sprachdienst der Erweiterung lädt es mit Nodes striktem ESM-Resolver.

**Ohne Auswirkung** – verifiziert:
- `npx expo config --type introspect` → exit 0, Plugin wird angewandt
- `npx expo run:android` → BUILD SUCCESSFUL, `android/.../autolinking.json` enthält `google-signin`
- App läuft, `tsc` und ESLint sauber

**Behoben** über `.vscode/settings.json` → `"expo.appManifest.pluginValidation": false`
(schaltet die Plugin-Validierung der Erweiterung ab; echte Plugin-Fehler zeigt der
Build ohnehin). Nicht per `patch-package` fixen – ein `.js`-Sibling für die
`*NativeComponent.ts`-Codegen-Spec bringt den Metro-Bundler zum Absturz
(„Could not find component config for native component").

## Test-Checkliste
- [ ] Google-Button auf Android → Konto-Auswahl → landet im Onboarding (neuer Nutzer) bzw. in den Tabs.
- [ ] Zweiter Login mit demselben Google-Konto → direkt in die App, kein Onboarding.
- [ ] iOS: Apple-Button sichtbar, Face/Touch-ID-Dialog, danach Onboarding.
- [ ] `supabase.auth.getUser()` nach Neustart der App → Session bleibt erhalten (AsyncStorage).
