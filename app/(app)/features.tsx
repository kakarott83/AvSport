/**
 * app/(app)/features.tsx — "Funktionen & Tipps"
 *
 * Statische Übersicht aller App-Funktionen, damit Nutzer z. B. die
 * foto-freien Erfassungswege finden. Erreichbar über Profil → Funktionen & Tipps.
 * Neue Features hier mit aufnehmen.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

type SectionKey = 'home' | 'training' | 'nutrition' | 'calendar' | 'cycle' | 'body' | 'profile';

type Section = { key: SectionKey; icon: IconName; color: string };

const SECTIONS: Section[] = [
  { key: 'home', icon: 'home', color: '#00E5FF' },
  { key: 'training', icon: 'fitness-center', color: '#FF9100' },
  { key: 'nutrition', icon: 'restaurant', color: '#0a7ea4' },
  { key: 'calendar', icon: 'event-note', color: '#BB86FC' },
  { key: 'cycle', icon: 'water-drop', color: '#FF5252' },
  { key: 'body', icon: 'monitor-weight', color: '#2ecc71' },
  { key: 'profile', icon: 'person', color: '#aaa' },
];

export default function FeaturesScreen() {
  const { t, tList } = useTranslation();
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Text style={s.intro}>{t('features.intro')}</Text>
      {SECTIONS.map((sec) => (
        <View key={sec.key} style={s.card}>
          <View style={s.cardHead}>
            <View style={[s.iconCircle, { backgroundColor: `${sec.color}22` }]}>
              <MaterialIcons name={sec.icon} size={18} color={sec.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{t(`features.${sec.key}.title`)}</Text>
              <Text style={s.where}>{t(`features.${sec.key}.where`)}</Text>
            </View>
          </View>
          {tList(`features.${sec.key}.points`).map((p) => (
            <View key={p} style={s.point}>
              <Text style={[s.bullet, { color: sec.color }]}>•</Text>
              <Text style={s.pointText}>{p}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  intro: { color: '#999', fontSize: 14, lineHeight: 20, marginBottom: 4 },
  card: { backgroundColor: '#1e1e1e', borderRadius: 16, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  where: { color: '#777', fontSize: 11, marginTop: 1 },
  point: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 14, lineHeight: 19, fontWeight: '800' },
  pointText: { flex: 1, color: '#ccc', fontSize: 13, lineHeight: 19 },
});
