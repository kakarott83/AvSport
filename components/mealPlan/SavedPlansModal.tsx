/** Liste der gespeicherten Mahlzeitenpläne: öffnen oder löschen. */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getLocale, useTranslation } from '@/lib/i18n';
import type { SavedMealPlan } from '@/services/mealPlans/mealPlanService';

type Props = {
  visible: boolean;
  plans: SavedMealPlan[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function SavedPlansModal({ visible, plans, activeId, onOpen, onDelete, onClose }: Props) {
  const { t } = useTranslation();

  const confirmDelete = (id: string) =>
    Alert.alert(t('mealPlan.history.deleteTitle'), t('mealPlan.history.deleteText'), [
      { text: t('mealPlan.form.cancel'), style: 'cancel' },
      { text: t('mealPlan.history.delete'), style: 'destructive', onPress: () => onDelete(id) },
    ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('mealPlan.history.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t('mealPlan.history.close')}>
              <MaterialIcons name="close" size={24} color="#aaa" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {plans.length === 0 && <Text style={styles.empty}>{t('mealPlan.history.empty')}</Text>}
            {plans.map((p) => {
              const active = p.id === activeId;
              return (
                <View key={p.id} style={[styles.row, active && styles.rowActive]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => onOpen(p.id)} activeOpacity={0.7}>
                    <Text style={styles.rowTitle}>
                      {t('mealPlan.history.item', {
                        date: formatDate(p.startDate),
                        days: t('mealPlan.history.days', { count: p.days }),
                      })}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {t(`mealPlan.form.diets.${p.preferences.diet ?? 'omnivore'}`)} · {p.targets.kcal} kcal
                      {active ? ` · ${t('mealPlan.history.current')}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t('mealPlan.history.delete')}>
                    <MaterialIcons name="delete-outline" size={22} color="#888" />
                  </TouchableOpacity>
                </View>
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
  sheet: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '80%', paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  list: { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  empty: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#222', borderRadius: 12, padding: 14 },
  rowActive: { borderWidth: 1, borderColor: '#0a7ea4' },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowMeta: { color: '#888', fontSize: 12, marginTop: 3 },
});
