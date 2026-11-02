/**
 * Vorgaben für einen neuen Mahlzeitenplan (Tab „Speiseplan“): Tage, Start,
 * Ernährungsform, Mahlzeiten pro Tag, Unverträglichkeiten, Kochaufwand.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import {
  COOKING_EFFORTS,
  DIET_TYPES,
  INTOLERANCE_PRESETS,
  MAX_DAYS,
  MEALS_PER_DAY,
  normalizeIntolerances,
  type MealPlanPreferences,
} from '@/lib/mealPlan';

export const ACCENT = '#0a7ea4';

type Props = {
  value: MealPlanPreferences;
  onChange: (next: MealPlanPreferences) => void;
  startOffset: 0 | 1;
  onStartOffsetChange: (offset: 0 | 1) => void;
  generating: boolean;
  onGenerate: () => void;
  /** Nur sichtbar, wenn schon ein Plan existiert, zu dem man zurück kann. */
  onCancel?: () => void;
};

const DAY_OPTIONS = Array.from({ length: MAX_DAYS }, (_, i) => i + 1);

export function MealPlanForm({ value, onChange, startOffset, onStartOffsetChange, generating, onGenerate, onCancel }: Props) {
  const { t } = useTranslation();
  const [other, setOther] = useState('');

  const set = <K extends keyof MealPlanPreferences>(key: K, v: MealPlanPreferences[K]) => onChange({ ...value, [key]: v });

  const toggleIntolerance = (item: string) =>
    set(
      'intolerances',
      value.intolerances.includes(item) ? value.intolerances.filter((i) => i !== item) : [...value.intolerances, item],
    );

  const addOther = () => {
    if (!other.trim()) return;
    set('intolerances', normalizeIntolerances([...value.intolerances, other]));
    setOther('');
  };

  const custom = value.intolerances.filter((i) => !(INTOLERANCE_PRESETS as readonly string[]).includes(i));

  return (
    <View style={styles.card}>
      <Label text={t('mealPlan.form.days')} />
      <View style={styles.chips}>
        {DAY_OPTIONS.map((d) => (
          <Chip key={d} label={String(d)} active={value.days === d} onPress={() => set('days', d)} compact />
        ))}
      </View>

      <Label text={t('mealPlan.form.start')} />
      <View style={styles.chips}>
        <Chip label={t('mealPlan.form.startToday')} active={startOffset === 0} onPress={() => onStartOffsetChange(0)} />
        <Chip label={t('mealPlan.form.startTomorrow')} active={startOffset === 1} onPress={() => onStartOffsetChange(1)} />
      </View>

      <Label text={t('mealPlan.form.diet')} />
      <View style={styles.chips}>
        {DIET_TYPES.map((d) => (
          <Chip key={d} label={t(`mealPlan.form.diets.${d}`)} active={value.diet === d} onPress={() => set('diet', d)} />
        ))}
      </View>

      <Label text={t('mealPlan.form.mealsPerDay')} />
      <View style={styles.chips}>
        {MEALS_PER_DAY.map((n) => (
          <Chip key={n} label={t(`mealPlan.form.meals.m${n}`)} active={value.mealsPerDay === n} onPress={() => set('mealsPerDay', n)} />
        ))}
      </View>

      <Label text={t('mealPlan.form.intolerances')} />
      <View style={styles.chips}>
        {INTOLERANCE_PRESETS.map((i) => (
          <Chip
            key={i}
            label={t(`mealPlan.form.intolerancePresets.${i}`)}
            active={value.intolerances.includes(i)}
            onPress={() => toggleIntolerance(i)}
          />
        ))}
        {custom.map((i) => (
          <Chip key={i} label={`${i}  ✕`} active onPress={() => toggleIntolerance(i)} />
        ))}
      </View>
      <View style={styles.otherRow}>
        <TextInput
          style={styles.input}
          value={other}
          onChangeText={setOther}
          placeholder={t('mealPlan.form.otherPlaceholder')}
          placeholderTextColor="#666"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={addOther}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addOther} accessibilityLabel={t('mealPlan.form.add')}>
          <MaterialIcons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <Label text={t('mealPlan.form.effort')} />
      <View style={styles.chips}>
        {COOKING_EFFORTS.map((e) => (
          <Chip key={e} label={t(`mealPlan.form.efforts.${e}`)} active={value.effort === e} onPress={() => set('effort', e)} />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.generateBtn, generating && styles.generateBtnBusy]}
        onPress={onGenerate}
        disabled={generating}
        activeOpacity={0.85}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <MaterialIcons name="auto-awesome" size={18} color="#fff" />
        )}
        <Text style={styles.generateText}>{generating ? t('mealPlan.form.generating') : t('mealPlan.form.generate')}</Text>
      </TouchableOpacity>
      {generating && <Text style={styles.hint}>{t('mealPlan.form.generatingHint')}</Text>}

      {onCancel && !generating && (
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('mealPlan.form.cancel')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function Chip({ label, active, onPress, compact }: { label: string; active: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.chip, compact && styles.chipCompact, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1e1e1e', borderRadius: 18, padding: 20, gap: 10 },
  label: { color: '#999', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipCompact: { minWidth: 38, alignItems: 'center' },
  chipActive: { backgroundColor: '#0a7ea422', borderColor: ACCENT },
  chipText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  otherRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#252525',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#fff',
    fontSize: 14,
  },
  addBtn: { width: 42, borderRadius: 12, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  generateBtn: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
  },
  generateBtnBusy: { opacity: 0.7 },
  generateText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { color: '#777', fontSize: 12, textAlign: 'center' },
  cancelBtn: { alignSelf: 'center', paddingVertical: 8 },
  cancelText: { color: '#888', fontSize: 14 },
});
