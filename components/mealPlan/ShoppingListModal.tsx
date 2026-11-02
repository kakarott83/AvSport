/** Einkaufsliste zum Speiseplan: Zutaten aller Tage zusammengefasst, zum Abhaken. */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatNumber, getLocale, useTranslation } from '@/lib/i18n';
import { buildShoppingList, type MealPlanData } from '@/lib/mealPlan';

type Props = {
  visible: boolean;
  plan: MealPlanData | null;
  onToggle: (key: string) => void;
  onClose: () => void;
};

export function ShoppingListModal({ visible, plan, onToggle, onClose }: Props) {
  const { t } = useTranslation();
  const items = useMemo(() => (plan ? buildShoppingList(plan, getLocale()) : []), [plan]);
  const checked = new Set(plan?.shoppingChecked ?? []);
  // Abgehakte ans Ende, sonst alphabetisch
  const sorted = [...items].sort((a, b) => Number(checked.has(a.key)) - Number(checked.has(b.key)));
  const days = plan?.days.length ?? 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('mealPlan.shopping.title')}</Text>
              <Text style={styles.subtitle}>
                {t('mealPlan.shopping.subtitle', {
                  days: t('mealPlan.history.days', { count: days }),
                  count: items.length,
                })}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={24} color="#aaa" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {sorted.length === 0 && <Text style={styles.empty}>{t('mealPlan.shopping.empty')}</Text>}
            {sorted.map((item) => {
              const done = checked.has(item.key);
              return (
                <TouchableOpacity key={item.key} style={styles.row} onPress={() => onToggle(item.key)} activeOpacity={0.7}>
                  <MaterialIcons name={done ? 'check-box' : 'check-box-outline-blank'} size={22} color={done ? '#22C55E' : '#777'} />
                  <Text style={[styles.name, done && styles.done]}>{item.name}</Text>
                  {item.uses > 1 && <Text style={styles.uses}>{t('mealPlan.shopping.uses', { count: item.uses })}</Text>}
                  <Text style={[styles.amount, done && styles.done]}>
                    {item.amount !== null ? `${formatNumber(item.amount)} ${item.unit}`.trim() : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%', paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 20, paddingBottom: 12, gap: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 3 },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  empty: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#252525' },
  name: { flex: 1, color: '#ddd', fontSize: 15 },
  uses: { color: '#666', fontSize: 12 },
  amount: { color: '#aaa', fontSize: 14, minWidth: 70, textAlign: 'right' },
  done: { color: '#666', textDecorationLine: 'line-through' },
});
