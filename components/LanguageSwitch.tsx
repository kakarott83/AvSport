/**
 * Kompakter Sprachumschalter (DE | EN) für Screens vor dem Profil,
 * z. B. Login, Registrierung und Onboarding.
 */

import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';

import { LANGUAGES, useTranslation } from '@/lib/i18n';

export function LanguageSwitch({ style }: { style?: ViewStyle }) {
  const { language, setLanguage } = useTranslation();

  return (
    <View style={[styles.row, style]}>
      {LANGUAGES.map((lang) => {
        const active = lang === language;
        return (
          <TouchableOpacity
            key={lang}
            onPress={() => setLanguage(lang)}
            style={[styles.pill, active && styles.pillActive]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.text, active && styles.textActive]}>{lang.toUpperCase()}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignSelf: 'flex-end' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
  },
  pillActive: { borderColor: '#00E5FF', backgroundColor: '#0a3a3a' },
  text: { color: '#666', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  textActive: { color: '#00E5FF' },
});
