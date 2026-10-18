/**
 * components/CalorieBreakdownModal.tsx
 *
 * Zeigt Schritt für Schritt, wie das tägliche Kalorienziel zustande kommt:
 * Grundumsatz (mit den eigenen Profilwerten eingesetzt) → × Aktivitätsfaktor
 * → Ziel-Anpassung, manueller Offset, Training, Health-Aktivität, Zyklus-Bonus
 * → Tagesziel. Alle Zahlen stammen aus `breakdown` (hooks/useCalorieGoal.ts),
 * damit Anzeige und tatsächliche Berechnung nie auseinanderlaufen.
 */

import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  CALORIE_GOAL_LABELS,
  FALLBACK_TDEE,
  type CalorieBreakdown,
} from '@/hooks/useCalorieGoal';
import { getLocale, useTranslation } from '@/lib/i18n';

const fmt = (n: number, digits = 0) =>
  n.toLocaleString(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Gewicht mit Nachkommastelle nur, wenn eine gespeichert ist (z.B. 72,5). */
const fmtKg = (n: number) => fmt(n, n % 1 ? 1 : 0);

const signed = (n: number) => `${n < 0 ? '−' : '+'} ${fmt(Math.abs(n))}`;

const HEALTH_SOURCE = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

function Row({
  label, hint, value, muted,
}: { label: string; hint?: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, muted && styles.muted]}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Text style={[styles.rowValue, muted && styles.muted]}>{value}</Text>
    </View>
  );
}

export function CalorieBreakdownModal({
  visible, breakdown, extraAdjustment = 0, onClose,
}: {
  visible: boolean;
  breakdown: CalorieBreakdown | null;
  /** Nur heute gültige Anpassung aus dem Ernährungs-Tab (nicht gespeichert). */
  extraAdjustment?: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!breakdown) return null;
  const b = breakdown;
  const years = t('calorieBreakdown.years');
  const isMale = b.inputs?.gender === 'male';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('calorieBreakdown.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {/* ── 1. Grundumsatz ── */}
            <Text style={styles.sectionTitle}>{t('calorieBreakdown.bmrTitle')}</Text>
            {b.inputs && b.bmr !== null ? (
              <>
                <Text style={styles.paragraph}>{t('calorieBreakdown.bmrText')}</Text>
                <Text style={styles.inputs}>
                  {isMale ? t('calorieBreakdown.male') : t('calorieBreakdown.female')} · {b.inputs.age} {years} · {fmtKg(b.inputs.weightKg)} kg · {fmt(b.inputs.heightCm)} cm
                </Text>
                <View style={styles.formulaBox}>
                  <Text style={styles.formula}>
                    {isMale
                      ? `${fmt(88.362, 3)} + ${fmt(13.397, 3)} × ${fmtKg(b.inputs.weightKg)} kg\n+ ${fmt(4.799, 3)} × ${fmt(b.inputs.heightCm)} cm\n− ${fmt(5.677, 3)} × ${b.inputs.age} ${years}`
                      : `${fmt(447.593, 3)} + ${fmt(9.247, 3)} × ${fmtKg(b.inputs.weightKg)} kg\n+ ${fmt(3.098, 3)} × ${fmt(b.inputs.heightCm)} cm\n− ${fmt(4.33, 2)} × ${b.inputs.age} ${years}`}
                  </Text>
                  <Text style={styles.formulaResult}>= {fmt(b.bmr)} kcal</Text>
                </View>

                {/* ── 2. Gesamtumsatz ── */}
                <Text style={styles.sectionTitle}>{t('calorieBreakdown.tdeeTitle')}</Text>
                <Text style={styles.paragraph}>
                  {t('calorieBreakdown.tdeeText', { factor: fmt(b.activityFactor, 2) })}
                </Text>
                <View style={styles.formulaBox}>
                  <Text style={styles.formula}>{fmt(b.bmr)} kcal × {fmt(b.activityFactor, 2)}</Text>
                  <Text style={styles.formulaResult}>= {fmt(b.tdee)} kcal</Text>
                </View>
              </>
            ) : (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>
                  {t('calorieBreakdown.incomplete', { kcal: fmt(FALLBACK_TDEE) })}
                </Text>
              </View>
            )}

            {/* ── 3. Tagesziel ── */}
            <Text style={styles.sectionTitle}>{t('calorieBreakdown.goalTitle', { n: b.inputs ? 3 : 2 })}</Text>
            <View style={styles.table}>
              <Row label={t('calorieBreakdown.tdee')} value={`${fmt(b.tdee)} kcal`} />
              <Row
                label={t('calorieBreakdown.goal', { goal: CALORIE_GOAL_LABELS[b.goalType] })}
                hint={b.goalType === 'lose' ? t('calorieBreakdown.deficit') : b.goalType === 'gain' ? t('calorieBreakdown.surplus') : undefined}
                value={b.goalAdjustment === 0 ? '± 0' : signed(b.goalAdjustment)}
              />
              {b.manualOffset !== 0 && (
                <Row label={t('calorieBreakdown.manual')} hint={t('calorieBreakdown.fromProfile')} value={signed(b.manualOffset)} />
              )}
              {b.workoutKcal > 0 && (
                <Row
                  label={t('calorieBreakdown.workoutToday')}
                  hint={b.workoutCounted
                    ? t('calorieBreakdown.workoutCounted')
                    : t('calorieBreakdown.workoutNotCounted')}
                  value={b.workoutCounted ? signed(b.workoutKcal) : fmt(b.workoutKcal)}
                  muted={!b.workoutCounted}
                />
              )}
              {b.healthKcal > 0 && (
                <Row label={t('calorieBreakdown.healthActivity', { source: HEALTH_SOURCE })} hint={t('calorieBreakdown.healthHint')} value={signed(b.healthKcal)} />
              )}
              {b.cycleBonus > 0 && (
                <Row label={t('calorieBreakdown.cycleBonus')} hint={t('calorieBreakdown.lutealPhase')} value={signed(b.cycleBonus)} />
              )}
              {extraAdjustment !== 0 && (
                <Row label={t('calorieBreakdown.todayOnly')} value={signed(extraAdjustment)} />
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('calorieBreakdown.dailyGoal')}</Text>
                <Text style={styles.totalValue}>{fmt(b.total + extraAdjustment)} kcal</Text>
              </View>
            </View>

            <Text style={styles.footnote}>{t('calorieBreakdown.footnote')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '88%', paddingTop: 18,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  title:     { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, marginRight: 12 },
  closeText: { color: '#888', fontSize: 18 },
  body:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  sectionTitle: {
    color: '#00E5FF', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4,
  },
  paragraph: { color: '#ccc', fontSize: 14, lineHeight: 21, marginBottom: 10 },
  inputs:    { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 10 },

  formulaBox: {
    backgroundColor: '#222', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  formula:       { color: '#aaa', fontSize: 14, lineHeight: 22, fontVariant: ['tabular-nums'] },
  formulaResult: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] },

  warnBox: {
    backgroundColor: '#2a2210', borderRadius: 12, borderWidth: 1, borderColor: '#FF9100',
    padding: 12, marginBottom: 20,
  },
  warnText: { color: '#ffc069', fontSize: 13, lineHeight: 19 },

  table:   { backgroundColor: '#222', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#2a2a2a', gap: 12,
  },
  rowText:  { flex: 1 },
  rowLabel: { color: '#e0e0e0', fontSize: 14 },
  rowHint:  { color: '#666', fontSize: 12, marginTop: 2 },
  rowValue: { color: '#fff', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  muted:    { color: '#555' },

  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 },
  totalLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  totalValue: { color: '#00E5FF', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },

  footnote: { color: '#555', fontSize: 12, lineHeight: 17, marginTop: 14 },
});
