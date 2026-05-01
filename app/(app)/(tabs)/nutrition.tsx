// TODO: Kamera-Workflow: 1. expo-camera öffnen 2. Foto aufnehmen 3. Base64 an analyzeFoodImage() senden 4. Ergebnis-Modal mit Makros (JSON) anzeigen & Speichern-Option bieten.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { Toast } from '@/components/Toast';
import { FoodScanner } from '@/components/FoodScanner';
import { useCalorieGoal } from '@/hooks/useCalorieGoal';
import { buildWeekDays, computeDayTotals, type FoodLog, type WeekDay } from '@/lib/nutrition';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const CHART_WIDTH = Dimensions.get('window').width - 80;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function offsetISO(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function macroColor(macro: 'protein' | 'carbs' | 'fat'): string {
  return macro === 'protein' ? '#0a7ea4' : macro === 'carbs' ? '#e67e22' : '#c0392b';
}

// ─────────────────────────────────────────
// CalorieRing
// ─────────────────────────────────────────

function CalorieRing({ eaten, goal }: { eaten: number; goal: number }) {
  const SIZE = 152;
  const HALF = SIZE / 2;
  const RING = 15;
  const INNER = SIZE - RING * 2;
  const progress = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const angle = progress * 360;
  const over = eaten > goal;
  const arcColor = over ? '#c0392b' : progress > 0.8 ? '#e67e22' : '#0a7ea4';
  const rightDeg = Math.min(angle, 180) - 180;
  const leftDeg = Math.max(angle - 180, 0) - 180;

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: HALF, backgroundColor: '#2a2a2a' }} />
      <View style={{ position: 'absolute', top: 0, right: 0, width: HALF, height: SIZE, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, left: -HALF, width: SIZE, height: SIZE, borderRadius: HALF, backgroundColor: arcColor, transform: [{ rotate: `${rightDeg}deg` }] }} />
      </View>
      <View style={{ position: 'absolute', top: 0, left: 0, width: HALF, height: SIZE, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, borderRadius: HALF, backgroundColor: arcColor, transform: [{ rotate: `${leftDeg}deg` }] }} />
      </View>
      <View style={{ position: 'absolute', top: RING, left: RING, width: INNER, height: INNER, borderRadius: INNER / 2, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: arcColor, fontSize: 26, fontWeight: '800', lineHeight: 30 }}>{eaten}</Text>
        <Text style={{ color: '#BBBBBB', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>kcal</Text>
        <Text style={{ color: '#999', fontSize: 10, marginTop: 2 }}>von {goal}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
// MacroBar
// ─────────────────────────────────────────

function MacroBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={macroStyles.row}>
      <Text style={macroStyles.label}>{label}</Text>
      <View style={macroStyles.barBg}>
        <View style={[macroStyles.barFill, { backgroundColor: color, width: `${Math.min(value / 3, 100)}%` }]} />
      </View>
      <Text style={[macroStyles.value, { color }]}>{value}g</Text>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { color: '#BBBBBB', fontSize: 12, width: 52 },
  barBg: { flex: 1, height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  value: { fontSize: 12, fontWeight: '700', width: 44, textAlign: 'right' },
});

// ─────────────────────────────────────────
// WeeklyChart
// ─────────────────────────────────────────

function WeeklyChart({ weekData, tdee }: { weekData: WeekDay[]; tdee: number }) {
  const maxVal = Math.max(tdee * 1.25, ...weekData.map((d) => d.eaten), 500);
  const bars = weekData.map((d) => ({
    value: d.eaten,
    label: d.label,
    frontColor: d.eaten === 0 ? '#252525' : d.eaten > tdee ? '#c0392b' : '#0a7ea4',
    topLabelComponent:
      d.eaten > 0
        ? () => <Text style={{ color: '#fff', fontSize: 9, marginBottom: 2 }}>{d.eaten}</Text>
        : undefined,
  }));

  return (
    <View>
      <View style={weekStyles.legend}>
        <View style={weekStyles.legendItem}>
          <View style={[weekStyles.dot, { backgroundColor: '#0a7ea4' }]} />
          <Text style={weekStyles.legendText}>Gegessen</Text>
        </View>
        <View style={weekStyles.legendItem}>
          <View style={[weekStyles.line, { backgroundColor: '#e67e22' }]} />
          <Text style={weekStyles.legendText}>Ziel ({tdee} kcal)</Text>
        </View>
      </View>
      <BarChart
        data={bars}
        width={CHART_WIDTH}
        barWidth={30}
        spacing={10}
        roundedTop
        noOfSections={4}
        maxValue={maxVal}
        showReferenceLine1
        referenceLine1Position={tdee}
        referenceLine1Config={{ color: '#e67e22', dashWidth: 4, dashGap: 4, thickness: 1.5, zIndex: 2 }}
        yAxisColor="transparent"
        xAxisColor="#2a2a2a"
        yAxisTextStyle={{ color: '#BBBBBB', fontSize: 9 }}
        xAxisLabelTextStyle={{ color: '#BBBBBB', fontSize: 10 }}
        backgroundColor="transparent"
        rulesColor="#1e1e1e"
        initialSpacing={8}
        endSpacing={8}
        isAnimated
      />
    </View>
  );
}

const weekStyles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 14, height: 2, borderRadius: 1 },
  legendText: { color: '#BBBBBB', fontSize: 11 },
});

// ─────────────────────────────────────────
// MealModal
// ─────────────────────────────────────────

type MealModalProps = { visible: boolean; onClose: () => void; onSaved: () => void };

function MealModal({ visible, onClose, onSaved }: MealModalProps) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function reset() { setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat(''); setError(''); }

  async function handleSave() {
    setError('');
    if (!name.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    const kcal = parseInt(calories, 10);
    if (!calories || isNaN(kcal) || kcal <= 0) { setError('Bitte gültige Kalorien eingeben.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error: dbErr } = await supabase.from('food_logs').insert({
      user_id: user.id,
      meal_name: name.trim(),
      calories: kcal,
      protein: protein ? parseFloat(protein) : null,
      carbs: carbs ? parseFloat(carbs) : null,
      fat: fat ? parseFloat(fat) : null,
    });

    setSaving(false);
    if (dbErr) { setError(`Fehler: ${dbErr.message}`); return; }
    reset();
    onSaved();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Mahlzeit erfassen</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>

          <Text style={modalStyles.label}>Name *</Text>
          <TextInput style={modalStyles.input} value={name} onChangeText={setName}
            placeholder="z.B. Haferflocken mit Milch" placeholderTextColor="#555" />

          <Text style={modalStyles.label}>Kalorien (kcal) *</Text>
          <TextInput style={modalStyles.input} value={calories} onChangeText={setCalories}
            placeholder="z.B. 350" placeholderTextColor="#555" keyboardType="number-pad" />

          <View style={modalStyles.macroRow}>
            {([['Protein', protein, setProtein], ['Carbs', carbs, setCarbs], ['Fett', fat, setFat]] as const).map(
              ([lbl, val, setter]) => (
                <View key={lbl} style={modalStyles.macroField}>
                  <Text style={modalStyles.label}>{lbl} (g)</Text>
                  <TextInput style={modalStyles.input} value={val} onChangeText={setter}
                    placeholder="0" placeholderTextColor="#555" keyboardType="decimal-pad" />
                </View>
              )
            )}
          </View>

          {error ? <Text style={modalStyles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[modalStyles.saveBtn, saving && modalStyles.saveBtnDisabled]}
            onPress={handleSave} disabled={saving} activeOpacity={0.8}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={modalStyles.saveBtnText}>Speichern</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1e1e1e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  label: { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
  input: {
    backgroundColor: '#2a2a2a', borderRadius: 10, padding: 13, fontSize: 15, color: '#fff',
    borderWidth: 1, borderColor: '#333', marginBottom: 12,
  },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroField: { flex: 1 },
  error: { color: '#c0392b', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  saveBtn: { backgroundColor: '#0a7ea4', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─────────────────────────────────────────
// Hauptscreen
// ─────────────────────────────────────────

export default function NutritionScreen() {
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [weekData, setWeekData] = useState<WeekDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Tages-Anpassung (lokal, kein DB-Speicher)
  const [dailyAdjustment, setDailyAdjustment] = useState(0);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustInput, setAdjustInput] = useState('');

  // Ziel-Kalorien aus dem zentralen Hook (inkl. Zyklus-Bonus)
  const { currentGoal, bonusActive, cycleBonus } = useCalorieGoal();

  const effectiveTdee = currentGoal + dailyAdjustment;

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const today    = todayISO();
    const tomorrow = offsetISO(1);

    const [profileRes, foodRes, weekRes] = await Promise.all([
      supabase.from('profiles')
        .select('display_name')
        .eq('id', user.id).single(),
      supabase.from('food_logs')
        .select('id, meal_name, calories, protein, carbs, fat, created_at')
        .eq('user_id', user.id)
        .gte('created_at', today).lt('created_at', tomorrow)
        .order('created_at', { ascending: false }),
      supabase.from('food_logs')
        .select('created_at, calories')
        .eq('user_id', user.id)
        .gte('created_at', offsetISO(-6)).lt('created_at', tomorrow),
    ]);

    if (profileRes.data) {
      setDisplayName(profileRes.data.display_name ?? null);
    }

    if (foodRes.data) setLogs(foodRes.data as FoodLog[]);

    const dayMap: Record<string, number> = {};
    weekRes.data?.forEach(l => {
      const day = l.created_at.slice(0, 10);
      dayMap[day] = (dayMap[day] ?? 0) + l.calories;
    });
    setWeekData(buildWeekDays(dayMap));

    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function handleDelete(id: string) {
    const deleted = logs.find((l) => l.id === id);
    await supabase.from('food_logs').delete().eq('id', id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
    if (deleted) {
      const day = deleted.created_at.slice(0, 10);
      setWeekData((prev) =>
        prev.map((d) => d.date === day ? { ...d, eaten: Math.max(0, d.eaten - deleted.calories) } : d)
      );
    }
  }

  function applyDailyAdjustment() {
    const val = parseInt(adjustInput, 10);
    setDailyAdjustment(isNaN(val) ? 0 : val);
    setAdjustOpen(false);
  }

  // ── Berechnungen ──
  const { totalKcal, totalProtein, totalCarbs, totalFat } = computeDayTotals(logs);
  const remaining = effectiveTdee - totalKcal;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ══ KALORIEN-KARTE ══ */}
        <View style={styles.card}>
          {/* Greeting */}
          <Text style={styles.greeting}>
            {displayName ? `Hallo ${displayName},` : 'Hallo,'}
          </Text>
          <Text style={styles.cardTitle}>
            dein Ziel für heute · {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
          </Text>

          <View style={styles.ringRow}>
            <CalorieRing eaten={totalKcal} goal={effectiveTdee} />
            <View style={styles.ringSummary}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{effectiveTdee}</Text>
                <Text style={styles.summaryLabel}>Ziel kcal</Text>
                {bonusActive && (
                  <Text style={styles.lutealBonusHint}>+{cycleBonus} kcal Bonus</Text>
                )}
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: remaining < 0 ? '#c0392b' : '#2ecc71' }]}>
                  {Math.abs(remaining)}
                </Text>
                <Text style={styles.summaryLabel}>
                  {remaining < 0 ? 'Überschuss' : 'Verbleibend'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Tages-Anpassung ── */}
          <TouchableOpacity
            style={styles.adjustTrigger}
            onPress={() => { setAdjustInput(dailyAdjustment !== 0 ? String(dailyAdjustment) : ''); setAdjustOpen(!adjustOpen); }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="tune" size={13} color="#555" />
            <Text style={styles.adjustTriggerText}>
              {dailyAdjustment !== 0
                ? `Tages-Anpassung: ${dailyAdjustment > 0 ? '+' : ''}${dailyAdjustment} kcal`
                : 'Ziel für heute anpassen'}
            </Text>
            <MaterialIcons name={adjustOpen ? 'expand-less' : 'expand-more'} size={14} color="#555" />
          </TouchableOpacity>

          {adjustOpen && (
            <View style={styles.adjustPanel}>
              <TextInput
                style={styles.adjustInput}
                value={adjustInput}
                onChangeText={(v) => setAdjustInput(v.replace(/[^0-9-]/g, ''))}
                placeholder="-300 oder +200"
                placeholderTextColor="#555"
                keyboardType="default"
                autoFocus
              />
              <View style={styles.adjustActions}>
                <TouchableOpacity style={styles.adjustReset} onPress={() => { setDailyAdjustment(0); setAdjustInput(''); setAdjustOpen(false); }}>
                  <Text style={styles.adjustResetText}>Zurücksetzen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adjustApply} onPress={applyDailyAdjustment}>
                  <Text style={styles.adjustApplyText}>Übernehmen</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Makro-Balken */}
          <View style={styles.macroSection}>
            <MacroBar label="Protein" value={totalProtein} color={macroColor('protein')} />
            <MacroBar label="Carbs" value={totalCarbs} color={macroColor('carbs')} />
            <MacroBar label="Fett" value={totalFat} color={macroColor('fat')} />
          </View>
        </View>

        {/* ══ WOCHEN-VERLAUF ══ */}
        {weekData.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitlePlain}>Verlauf · letzte 7 Tage</Text>
            <WeeklyChart weekData={weekData} tdee={effectiveTdee} />
          </View>
        )}

        {/* ══ JOURNAL HEADER ══ */}
        <View style={styles.journalHeader}>
          <Text style={styles.sectionTitle}>Tages-Journal</Text>
          <View style={styles.journalActions}>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => setScannerOpen(true)} activeOpacity={0.8}>
              <MaterialIcons name="camera-alt" size={18} color="#00E5FF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={() => setModalOpen(true)} activeOpacity={0.8}>
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Mahlzeit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ══ MAHLZEITEN-LISTE ══ */}
        {loading ? (
          <ActivityIndicator color="#0a7ea4" style={{ marginTop: 32 }} />
        ) : logs.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="restaurant" size={40} color="#2a2a2a" />
            <Text style={styles.emptyText}>Noch keine Mahlzeiten heute</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => setModalOpen(true)}>
              <Text style={styles.emptyButtonText}>Erste Mahlzeit erfassen</Text>
            </TouchableOpacity>
          </View>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logLeft}>
                <View style={styles.logIconCircle}>
                  <MaterialIcons name="restaurant" size={16} color="#0a7ea4" />
                </View>
                <View style={styles.logInfo}>
                  <Text style={styles.logName}>{log.meal_name}</Text>
                  <Text style={styles.logMacros}>
                    {[
                      log.protein != null && `P ${log.protein}g`,
                      log.carbs != null && `C ${log.carbs}g`,
                      log.fat != null && `F ${log.fat}g`,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              <View style={styles.logRight}>
                <Text style={styles.logKcal}>{log.calories} kcal</Text>
                <TouchableOpacity onPress={() => handleDelete(log.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialIcons name="close" size={16} color="#444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <MealModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); setToast('Mahlzeit gespeichert!'); loadData(); }}
      />

      <FoodScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={() => { setToast('Mahlzeit gespeichert!'); loadData(); }}
      />

      {toast && <Toast message={toast} type="success" duration={2000} onDismiss={() => setToast(null)} />}
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#121212' },
  container: { padding: 20, paddingTop: 16, paddingBottom: 56 },

  card: { backgroundColor: '#1e1e1e', borderRadius: 20, padding: 20, marginBottom: 16 },
  greeting: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 2 },
  cardTitle: {
    color: '#999', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 20,
  },
  cardTitlePlain: {
    color: '#999', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16,
  },

  ringRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  ringSummary: { flex: 1, marginLeft: 20, gap: 14 },
  summaryItem: { gap: 2 },
  summaryValue: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 28 },
  summaryLabel:     { color: '#999', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  lutealBonusHint:  { color: '#FF9100', fontSize: 10, fontWeight: '700', marginTop: 2 },
  summaryDivider: { height: 1, backgroundColor: '#2a2a2a' },

  // Daily adjustment
  adjustTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, marginBottom: 12,
  },
  adjustTriggerText: { flex: 1, color: '#999', fontSize: 12 },
  adjustPanel: { marginBottom: 12 },
  adjustInput: {
    backgroundColor: '#2a2a2a', borderRadius: 8, padding: 10,
    fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#333', marginBottom: 8,
  },
  adjustActions: { flexDirection: 'row', gap: 8 },
  adjustReset: {
    flex: 1, padding: 10, borderRadius: 8,
    backgroundColor: '#2a2a2a', alignItems: 'center',
  },
  adjustResetText: { color: '#999', fontSize: 13, fontWeight: '600' },
  adjustApply: {
    flex: 1, padding: 10, borderRadius: 8,
    backgroundColor: '#0a7ea4', alignItems: 'center',
  },
  adjustApplyText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  macroSection: { borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 16 },

  journalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, marginTop: 8,
  },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  journalActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cameraBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#00E5FF44',
    alignItems: 'center', justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0a7ea4', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  addButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: '#888', fontSize: 14 },
  emptyButton: { backgroundColor: '#0a7ea4', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  logCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e1e1e', borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8,
  },
  logLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logIconCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1a2a30', alignItems: 'center', justifyContent: 'center',
  },
  logInfo: { flex: 1 },
  logName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  logMacros: { color: '#999', fontSize: 11, marginTop: 2 },
  logRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logKcal: { color: '#0a7ea4', fontSize: 14, fontWeight: '700' },
});
