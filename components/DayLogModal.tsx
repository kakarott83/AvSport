/**
 * "Tag erfassen" — mehrere bereits bekannte Gerichte auf einmal für heute
 * eintragen, ohne Foto. Vorschläge stammen aus dem eigenen food_logs-Verlauf
 * (häufigste zuerst); pro Gericht lässt sich die Portion bzw. die kcal anpassen.
 * Zusätzlich können neue Gerichte manuell eingetragen und mitgespeichert werden.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { buildMealSuggestions, scaleMeal, type MealHistoryEntry, type MealSuggestion } from '@/lib/nutrition';
import { parseDecimal, sanitizeDecimalInput } from '@/lib/profile';
import { supabase } from '@/services/supabaseClient';

const HISTORY_DAYS  = 90;
const HISTORY_LIMIT = 500;
const PORTIONS = [
  { label: '½', factor: 0.5 },
  { label: '1', factor: 1 },
  { label: '1½', factor: 1.5 },
  { label: '2', factor: 2 },
];

type Selection = { factor: number; kcalText: string };

/** Manuell eingetragenes Gericht (Eingabefelder als Text). */
type CustomMeal = { key: string; name: string; kcal: string; protein: string; carbs: string; fat: string };

const CUSTOM_FIELDS = [
  { field: 'kcal',    label: 'kcal *', keyboard: 'number-pad'  },
  { field: 'protein', label: 'P (g)',  keyboard: 'decimal-pad' },
  { field: 'carbs',   label: 'KH (g)', keyboard: 'decimal-pad' },
  { field: 'fat',     label: 'F (g)',  keyboard: 'decimal-pad' },
] as const;

let customKeySeq = 0;
const newCustomMeal = (): CustomMeal =>
  ({ key: `c${++customKeySeq}`, name: '', kcal: '', protein: '', carbs: '', fat: '' });

const optionalGrams = (v: string) => {
  const n = parseDecimal(v);
  return isNaN(n) ? null : n;
};

type Props = { visible: boolean; onClose: () => void; onSaved: (count: number) => void };

export function DayLogModal({ visible, onClose, onSaved }: Props) {
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [customs, setCustoms] = useState<CustomMeal[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
      const { data, error: dbErr } = await supabase
        .from('food_logs')
        .select('meal_name, calories, protein, carbs, fat, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (cancelled) return;
      if (dbErr) setError(`Verlauf konnte nicht geladen werden: ${dbErr.message}`);
      setSuggestions(buildMealSuggestions((data ?? []) as MealHistoryEntry[]));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible]);

  function reset() { setSelected({}); setCustoms([]); setQuery(''); setError(''); }

  function updateCustom(key: string, patch: Partial<CustomMeal>) {
    setCustoms((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }
  function handleClose() { reset(); onClose(); }

  function toggle(meal: MealSuggestion) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[meal.key]) delete next[meal.key];
      else next[meal.key] = { factor: 1, kcalText: String(meal.calories) };
      return next;
    });
  }

  function setPortion(meal: MealSuggestion, factor: number) {
    setSelected((prev) => ({ ...prev, [meal.key]: { factor, kcalText: String(Math.round(meal.calories * factor)) } }));
  }

  /** Freie kcal-Eingabe → Faktor relativ zur Vorlage, Makros skalieren mit. */
  function setKcal(meal: MealSuggestion, text: string) {
    const clean = text.replace(/\D/g, '').slice(0, 4);
    const kcal = parseInt(clean, 10);
    setSelected((prev) => ({
      ...prev,
      [meal.key]: { kcalText: clean, factor: kcal > 0 ? kcal / meal.calories : 0 },
    }));
  }

  const visibleMeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? suggestions.filter((m) => m.name.toLowerCase().includes(q)) : suggestions;
  }, [suggestions, query]);

  const chosen = suggestions.filter((m) => selected[m.key] && selected[m.key].factor > 0);
  const validCustoms = customs.filter((c) => c.name.trim() && parseInt(c.kcal, 10) > 0);
  const count = chosen.length + validCustoms.length;
  const totalKcal =
    chosen.reduce((sum, m) => sum + scaleMeal(m, selected[m.key].factor).calories, 0) +
    validCustoms.reduce((sum, c) => sum + parseInt(c.kcal, 10), 0);

  async function handleSave() {
    if (count === 0) return;
    setError('');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setError('Nicht eingeloggt.'); return; }

    const rows = [
      ...chosen.map((m) => ({ user_id: user.id, meal_name: m.name, ...scaleMeal(m, selected[m.key].factor) })),
      ...validCustoms.map((c) => ({
        user_id:   user.id,
        meal_name: c.name.trim(),
        calories:  parseInt(c.kcal, 10),
        protein:   optionalGrams(c.protein),
        carbs:     optionalGrams(c.carbs),
        fat:       optionalGrams(c.fat),
      })),
    ];
    const { error: dbErr } = await supabase.from('food_logs').insert(rows);
    setSaving(false);
    if (dbErr) { setError(`Speichern fehlgeschlagen: ${dbErr.message}`); return; }

    reset();
    onSaved(rows.length);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Tag erfassen</Text>
            <Text style={s.subtitle}>Wähle aus deinem Verlauf oder trag Gerichte selbst ein.</Text>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={24} color="#888" />
          </TouchableOpacity>
        </View>

        {suggestions.length > 0 && (
          <View style={s.searchWrap}>
            <MaterialIcons name="search" size={18} color="#666" />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Gericht suchen"
              placeholderTextColor="#555"
            />
          </View>
        )}

        <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {customs.map((c) => (
            <View key={c.key} style={[s.row, s.rowSelected, s.customRow]}>
              <View style={s.customHead}>
                <TextInput
                  style={[s.field, { flex: 1 }]}
                  value={c.name}
                  onChangeText={(v) => updateCustom(c.key, { name: v })}
                  placeholder="Gericht, z. B. Käsebrot"
                  placeholderTextColor="#555"
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => setCustoms((prev) => prev.filter((x) => x.key !== c.key))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={18} color="#666" />
                </TouchableOpacity>
              </View>
              <View style={s.customFields}>
                {CUSTOM_FIELDS.map(({ field, label, keyboard }) => (
                  <View key={field} style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>{label}</Text>
                    <TextInput
                      style={s.field}
                      value={c[field]}
                      onChangeText={(v) => updateCustom(c.key, {
                        [field]: field === 'kcal' ? v.replace(/\D/g, '').slice(0, 4) : sanitizeDecimalInput(v),
                      })}
                      placeholder="0"
                      placeholderTextColor="#555"
                      keyboardType={keyboard}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={s.addCustomBtn}
            onPress={() => setCustoms((prev) => [...prev, newCustomMeal()])}
            activeOpacity={0.7}
          >
            <MaterialIcons name="add" size={18} color="#00E5FF" />
            <Text style={s.addCustomText}>Eigenes Gericht eintragen</Text>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator color="#0a7ea4" style={{ marginTop: 40 }} />
          ) : suggestions.length === 0 ? (
            <View style={s.empty}>
              <MaterialIcons name="history" size={40} color="#2a2a2a" />
              <Text style={s.emptyText}>
                Noch keine Gerichte im Verlauf. Trag sie oben selbst ein oder erfasse sie per Foto — danach erscheinen sie hier als Vorschlag.
              </Text>
            </View>
          ) : visibleMeals.length === 0 ? (
            <Text style={s.emptyText}>Kein Gericht gefunden.</Text>
          ) : (
            visibleMeals.map((meal) => {
              const sel = selected[meal.key];
              const scaled = sel ? scaleMeal(meal, sel.factor) : null;
              return (
                <View key={meal.key} style={[s.row, sel && s.rowSelected]}>
                  <TouchableOpacity style={s.rowHead} onPress={() => toggle(meal)} activeOpacity={0.7}>
                    <MaterialIcons
                      name={sel ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={sel ? '#00E5FF' : '#555'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.mealName} numberOfLines={2}>{meal.name}</Text>
                      <Text style={s.mealMeta}>
                        {meal.calories} kcal · {meal.count}× erfasst
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {sel && scaled && (
                    <View style={s.adjust}>
                      <View style={s.portionRow}>
                        {PORTIONS.map((p) => (
                          <TouchableOpacity
                            key={p.label}
                            style={[s.portionChip, sel.factor === p.factor && s.portionChipActive]}
                            onPress={() => setPortion(meal, p.factor)}
                            activeOpacity={0.75}
                          >
                            <Text style={[s.portionText, sel.factor === p.factor && s.portionTextActive]}>{p.label}×</Text>
                          </TouchableOpacity>
                        ))}
                        <View style={s.kcalWrap}>
                          <TextInput
                            style={s.kcalInput}
                            value={sel.kcalText}
                            onChangeText={(t) => setKcal(meal, t)}
                            keyboardType="number-pad"
                            textAlign="right"
                          />
                          <Text style={s.kcalUnit}>kcal</Text>
                        </View>
                      </View>
                      <Text style={s.macros}>
                        {[
                          scaled.protein != null && `P ${scaled.protein} g`,
                          scaled.carbs != null && `KH ${scaled.carbs} g`,
                          scaled.fat != null && `F ${scaled.fat} g`,
                        ].filter(Boolean).join(' · ') || 'Keine Makros hinterlegt'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={s.footer}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[s.saveBtn, (count === 0 || saving) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={count === 0 || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>
                {count === 0
                  ? 'Gerichte auswählen oder eintragen'
                  : `${count} ${count === 1 ? 'Gericht' : 'Gerichte'} speichern · ${totalKcal} kcal`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 13, marginTop: 4, lineHeight: 18 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 8,
    backgroundColor: '#1e1e1e', borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: '#fff', fontSize: 14 },

  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 40, paddingHorizontal: 12 },
  emptyText: { color: '#888', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 12 },

  row: { backgroundColor: '#1e1e1e', borderRadius: 14, borderWidth: 1, borderColor: '#1e1e1e' },
  rowSelected: { borderColor: '#00E5FF44' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  mealName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  mealMeta: { color: '#777', fontSize: 11, marginTop: 2 },

  adjust: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  portionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  portionChip: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#333',
  },
  portionChipActive: { backgroundColor: '#0a2a30', borderColor: '#00E5FF' },
  portionText: { color: '#aaa', fontSize: 13, fontWeight: '700' },
  portionTextActive: { color: '#00E5FF' },
  kcalWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
    backgroundColor: '#2a2a2a', borderRadius: 8, borderWidth: 1, borderColor: '#333', paddingHorizontal: 8,
  },
  kcalInput: { minWidth: 44, paddingVertical: 6, color: '#fff', fontSize: 14, fontWeight: '700' },
  kcalUnit: { color: '#777', fontSize: 12 },
  macros: { color: '#888', fontSize: 11 },

  customRow: { padding: 12, gap: 8 },
  customHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customFields: { flexDirection: 'row', gap: 6 },
  fieldLabel: { color: '#777', fontSize: 10, fontWeight: '600', marginBottom: 3 },
  field: {
    backgroundColor: '#2a2a2a', borderRadius: 8, borderWidth: 1, borderColor: '#333',
    paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 14,
  },
  addCustomBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addCustomText: { color: '#00E5FF', fontSize: 14, fontWeight: '600' },

  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 36, borderTopWidth: 1, borderTopColor: '#1e1e1e', gap: 8 },
  error: { color: '#c0392b', fontSize: 13, textAlign: 'center' },
  saveBtn: { backgroundColor: '#0a7ea4', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
