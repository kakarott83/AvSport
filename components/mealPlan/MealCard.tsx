/**
 * Eine geplante Mahlzeit im Speiseplan: Name, Nährwerte, aufklappbar mit
 * Zubereitung und Zutaten; Aktionen „Als gegessen eintragen“ und „Neu generieren“.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatNumber, useTranslation } from '@/lib/i18n';
import type { PlannedMeal } from '@/lib/mealPlan';

const ACCENT = '#0a7ea4';
const GREEN = '#22C55E';

type Props = {
  meal: PlannedMeal;
  /** Welche Aktion gerade für diese Mahlzeit läuft. */
  busy: 'log' | 'regenerate' | null;
  /** Während eine andere Aktion läuft, sind die Buttons gesperrt. */
  disabled: boolean;
  onLog: () => void;
  onRegenerate: () => void;
};

export function MealCard({ meal, busy, disabled, onLog, onRegenerate }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const logged = meal.loggedAt !== null;

  return (
    <View style={[styles.card, logged && styles.cardLogged]}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.8} style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.slot}>
            {t(`mealPlan.slots.${meal.slot}`)}
            {meal.prepMinutes ? `  ·  ${t('mealPlan.plan.prepMinutes', { min: meal.prepMinutes })}` : ''}
          </Text>
          <Text style={styles.name}>{meal.name}</Text>
          <Text style={styles.macros}>
            <Text style={styles.kcal}>{formatNumber(meal.calories)} kcal</Text>
            {'  '}
            {t('mealPlan.plan.macros', { p: meal.protein, c: meal.carbs, f: meal.fat })}
          </Text>
        </View>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color="#777" />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          {meal.description ? <Text style={styles.description}>{meal.description}</Text> : null}
          {meal.ingredients.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{t('mealPlan.plan.ingredients')}</Text>
              {meal.ingredients.map((ing, i) => (
                <View key={`${ing.name}-${i}`} style={styles.ingredientRow}>
                  <Text style={styles.ingredientName}>{ing.name}</Text>
                  <Text style={styles.ingredientAmount}>
                    {ing.amount !== null ? `${formatNumber(ing.amount)} ${ing.unit}`.trim() : t('mealPlan.plan.toTaste')}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, logged && styles.actionBtnDone]}
          onPress={onLog}
          disabled={logged || disabled}
          activeOpacity={0.8}
        >
          {busy === 'log' ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <MaterialIcons name={logged ? 'check-circle' : 'playlist-add-check'} size={17} color={logged ? GREEN : ACCENT} />
          )}
          <Text style={[styles.actionText, logged && { color: GREEN }]}>
            {logged ? t('mealPlan.plan.logged') : t('mealPlan.plan.log')}
          </Text>
        </TouchableOpacity>
        {!logged && (
          <TouchableOpacity style={styles.actionBtn} onPress={onRegenerate} disabled={disabled} activeOpacity={0.8}>
            {busy === 'regenerate' ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <MaterialIcons name="refresh" size={17} color={ACCENT} />
            )}
            <Text style={styles.actionText}>{t('mealPlan.plan.regenerate')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1e1e1e', borderRadius: 16, padding: 16, gap: 10 },
  cardLogged: { opacity: 0.75 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  slot: { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 3 },
  macros: { color: '#999', fontSize: 12, marginTop: 4 },
  kcal: { color: ACCENT, fontWeight: '700' },
  body: { gap: 6, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 10 },
  description: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  sectionLabel: { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  ingredientName: { color: '#ddd', fontSize: 14, flex: 1 },
  ingredientAmount: { color: '#999', fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#252525',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionBtnDone: { backgroundColor: '#22C55E1a' },
  actionText: { color: '#ddd', fontSize: 13, fontWeight: '600' },
});
