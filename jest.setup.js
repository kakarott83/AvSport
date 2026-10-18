/**
 * Zusätzliches Jest-Setup (läuft vor dem Testframework, nach dem jest-expo-Preset).
 *
 * `lib/purchases.ts` prüft `NativeModules.RNPurchases`, um in Expo Go / einem
 * veralteten Dev-Build (natives Modul == null) ein No-op zu bleiben. In Tests
 * ist das native Modul nicht vorhanden — hier stellen wir einen Platzhalter
 * bereit, damit der Wrapper wie in einem echten Build "verfügbar" ist.
 * Das Verhalten selbst kommt aus __mocks__/react-native-purchases.ts.
 */
const { NativeModules } = require('react-native');

if (NativeModules.RNPurchases == null) {
  NativeModules.RNPurchases = {};
}

// Tests prüfen die deutschen Texte — unabhängig von der Systemsprache der Maschine.
require('./lib/i18n').setLanguage('de', { persist: false });
