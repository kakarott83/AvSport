/**
 * components/TipOfTheDayCard.tsx — kompakte Karte „Tipp des Tages“ auf dem
 * Home-Screen. Tippen öffnet components/TipDetailModal.tsx.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { TIP_CATEGORY_COLORS, TIP_CATEGORY_ICONS, localizeTip, type Tip } from '@/lib/tips';

export function TipOfTheDayCard({ tip, onPress }: { tip: Tip; onPress: () => void }) {
  const { t, language } = useTranslation();
  const { title, body } = localizeTip(tip, language);
  const color = TIP_CATEGORY_COLORS[tip.category];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <View style={[styles.iconWrap, { backgroundColor: color + '1F' }]}>
        <MaterialIcons
          name={TIP_CATEGORY_ICONS[tip.category] as keyof typeof MaterialIcons.glyphMap}
          size={20}
          color={color}
        />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label}>
          {t('tips.label')} · <Text style={{ color }}>{t(`tips.categories.${tip.category}`)}</Text>
        </Text>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.body} numberOfLines={2}>{body}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#555" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1 },
  label: {
    color: '#BBBBBB', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  body: { color: '#999', fontSize: 12, lineHeight: 17 },
});
